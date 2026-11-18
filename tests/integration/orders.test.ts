import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { createOrder } from "@/server/orders/create";
import { buildQuote } from "@/server/orders/quote";
import { baseRows, cleanCatalog, csv, importCsv } from "./helpers";

async function setup() {
  await importCsv(csv(baseRows()), { publishNew: true });
  const [sal1, sal2] = await Promise.all([
    prisma.pharmacy.findUniqueOrThrow({ where: { code: "SAL-01" } }),
    prisma.pharmacy.findUniqueOrThrow({ where: { code: "SAL-02" } }),
  ]);
  const v200 = await prisma.productVariant.findUniqueOrThrow({ where: { salamatSku: "TS-1" } });
  const v400 = await prisma.productVariant.findUniqueOrThrow({ where: { salamatSku: "TS-2" } });
  const rx = await prisma.productVariant.findUniqueOrThrow({ where: { salamatSku: "TS-3" } });
  return { sal1, sal2, v200, v400, rx };
}

const order = (o: Record<string, unknown>) => ({ idempotencyKey: randomUUID(), fulfillment: "PICKUP", name: "Айгерим", phone: "+7 701 123 45 67", consent: true, locale: "ru", ...o });

describe("pickup requests", () => {
  beforeEach(cleanCatalog);

  it("prices depend on the selected pharmacy", async () => {
    const { sal1, sal2, v200 } = await setup();
    const a = await buildQuote({ pharmacyId: sal1.id, items: [{ variantId: v200.id, quantity: 2 }], locale: "ru" });
    const b = await buildQuote({ pharmacyId: sal2.id, items: [{ variantId: v200.id, quantity: 2 }], locale: "ru" });
    expect(a.totalKzt).toBe(600);
    expect(b.totalKzt).toBe(640);
  });

  it("saves the request with snapshots and is idempotent", async () => {
    const { sal1, v200 } = await setup();
    const input = order({ pharmacyId: sal1.id, items: [{ variantId: v200.id, quantity: 2, seenPriceKzt: 300 }] });
    const first = await createOrder(input, "client-a");
    expect(first.ok).toBe(true);
    const again = await createOrder(input, "client-a");
    expect(again.ok && again.duplicate).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    const saved = await prisma.order.findFirstOrThrow({ include: { items: true, events: true } });
    expect(saved.status).toBe("NEW");
    expect(saved.customerPhone).toBe("+77011234567");
    expect(saved.totalKzt).toBe(600);
    expect(saved.items[0].nameSnapshot).toBe("Тестофен 200 мг №10 табл.");
    expect(saved.items[0].unitPriceKzt).toBe(300);
    expect(saved.events[0].toStatus).toBe("NEW");
    expect(saved.consentVersion).toBeTruthy();
  });

  it("re-checks prices before saving and reports changes", async () => {
    const { sal1, v200 } = await setup();
    await prisma.price.updateMany({ where: { variantId: v200.id, pharmacyId: sal1.id }, data: { priceKzt: 340, sourceUpdatedAt: new Date() } });
    const res = await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: v200.id, quantity: 1, seenPriceKzt: 300 }] }), "client-b");
    expect(res.ok).toBe(false);
    if (!res.ok && res.status === 409) {
      expect(res.code).toBe("changed");
      expect(res.quote?.lines[0].unitPriceKzt).toBe(340);
    }
    expect(await prisma.order.count()).toBe(0);
  });

  it("blocks unavailable and prescription items according to settings", async () => {
    const { sal1, v400, rx } = await setup();
    const out = await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: v400.id, quantity: 1 }] }), "client-c");
    expect(!out.ok && out.status === 409 && out.code).toBe("blocked_items");
    const rxRes = await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: rx.id, quantity: 1 }] }), "client-c");
    expect(!rxRes.ok && rxRes.status === 409 && rxRes.code).toBe("blocked_items");
  });

  it("validates required fields and phone on the server", async () => {
    const { sal1, v200 } = await setup();
    const bad = await createOrder(order({ pharmacyId: sal1.id, name: "", phone: "123", consent: false, items: [{ variantId: v200.id, quantity: 1 }] }), "client-d");
    expect(bad.ok).toBe(false);
    if (!bad.ok && bad.status === 400) expect(Object.keys(bad.errors)).toEqual(expect.arrayContaining(["name", "consent"]));
    const badPhone = await createOrder(order({ pharmacyId: sal1.id, phone: "+1 202 555 0100", items: [{ variantId: v200.id, quantity: 1, seenPriceKzt: 300 }] }), "client-d");
    expect(!badPhone.ok && badPhone.status === 400 && badPhone.errors.phone).toBe("phoneInvalid");
  });

  it("accepts unknown-price items as 'to be confirmed' lines without a total", async () => {
    const { sal1, v200 } = await setup();
    await prisma.price.deleteMany({ where: { variantId: v200.id, pharmacyId: sal1.id } });
    const res = await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: v200.id, quantity: 1, seenPriceKzt: null }] }), "client-e");
    expect(res.ok).toBe(true);
    const saved = await prisma.order.findFirstOrThrow({ include: { items: true } });
    expect(saved.items[0].unitPriceKzt).toBeNull();
    expect(saved.hasUnpricedItems).toBe(true);
    expect(saved.totalKzt).toBeNull();
  });

  it("rate-limits repeated submissions from one client", async () => {
    const { sal1, v200 } = await setup();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: v200.id, quantity: 1, seenPriceKzt: 300 }] }), "client-flood"));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results[5]).toMatchObject({ ok: false, status: 429 });
  });
  it("catalogue products go into a request 'to be confirmed': no price, no total, article kept", async () => {
    const sal1 = await prisma.pharmacy.findUniqueOrThrow({ where: { code: "SAL-01" } });
    const rows = await prisma.$queryRaw<{ id: string; article: string; name: string }[]>`SELECT id::text AS id, article, name FROM public.pharmacy_products WHERE article = 'ASP-100' LIMIT 1`;
    const item = rows[0];
    const quote = await buildQuote({ pharmacyId: sal1.id, items: [{ variantId: item.id, quantity: 3, seenPriceKzt: null }], locale: "ru" });
    expect(quote.lines[0]).toMatchObject({ kind: "catalog", fullName: item.name, article: "ASP-100", unitPriceKzt: null, blocking: false });
    expect(quote.lines[0].issues).toContain("needs_confirmation");
    expect(quote.hasUnpriced).toBe(true);
    expect(quote.hasBlocking).toBe(false);
    expect(quote.totalKzt).toBe(0);

    const res = await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: item.id, quantity: 3, seenPriceKzt: null }] }), "client-cat");
    expect(res.ok).toBe(true);
    const saved = await prisma.order.findFirstOrThrow({ include: { items: true } });
    expect(saved.status).toBe("NEW");
    expect(saved.totalKzt).toBeNull();
    expect(saved.hasUnpricedItems).toBe(true);
    expect(saved.items[0]).toMatchObject({ variantId: null, nameSnapshot: item.name, skuSnapshot: "ASP-100", quantity: 3, unitPriceKzt: null, lineTotalKzt: null });
  });

  it("mixes priced SKUs and catalogue products; unknown catalogue ids block the request", async () => {
    const { sal1, v200 } = await setup();
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM public.pharmacy_products ORDER BY id LIMIT 1`;
    const mixed = await buildQuote({ pharmacyId: sal1.id, items: [{ variantId: v200.id, quantity: 1, seenPriceKzt: 300 }, { variantId: rows[0].id, quantity: 1 }], locale: "ru" });
    expect(mixed.totalKzt).toBe(300);
    expect(mixed.hasUnpriced).toBe(true);
    expect(mixed.hasBlocking).toBe(false);
    const missing = await buildQuote({ pharmacyId: sal1.id, items: [{ variantId: "999999999999", quantity: 1 }], locale: "ru" });
    expect(missing.lines[0].issues).toContain("removed");
    expect(missing.hasBlocking).toBe(true);
    const res = await createOrder(order({ pharmacyId: sal1.id, items: [{ variantId: "999999999999", quantity: 1 }] }), "client-missing");
    expect(res.ok).toBe(false);
    expect(await prisma.order.count()).toBe(0);
  });
});
