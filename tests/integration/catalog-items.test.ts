import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { catalogTokens, getCatalogItem, isCatalogId, listCatalogItems, listCatalogItemsByIds, listCatalogPreview, suggestCatalogItems } from "@/server/catalog-items";

async function tableCount() {
  const r = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`;
  return Number(r[0].n);
}

async function walk(q: string | null, pageSize: number) {
  const ids: string[] = [];
  const first = await listCatalogItems({ q, page: 1, pageSize });
  for (let page = 1; page <= first.pageCount; page++) {
    const res = page === 1 ? first : await listCatalogItems({ q, page, pageSize });
    ids.push(...res.items.map((i) => i.id));
  }
  return { ids, total: first.total };
}

describe("catalogue from public.pharmacy_products", () => {
  it("reports the full table size as total", async () => {
    const res = await listCatalogItems({});
    expect(res.total).toBe(await tableCount());
    expect(res.items).toHaveLength(24);
    expect(res.pageSize).toBe(24);
  });

  it("pages never repeat or skip records", async () => {
    for (const size of [24, 48, 7]) {
      const { ids, total } = await walk(null, size);
      expect(ids.length).toBe(total);
      expect(new Set(ids).size).toBe(total);
    }
  });

  it("caps the page size and returns an empty page beyond the end", async () => {
    expect((await listCatalogItems({ pageSize: 10_000 })).items).toHaveLength(48);
    const far = await listCatalogItems({ page: 9999 });
    expect(far.items).toEqual([]);
    expect(far.total).toBe(await tableCount());
  });

  it("searches Cyrillic names case-insensitively and by part of the name", async () => {
    for (const q of ["парацетамол", "ПАРАЦЕТАМОЛ", "параЦ"]) {
      const res = await listCatalogItems({ q });
      expect(res.total, q).toBe(3);
      expect(res.items.every((i) => /парацетамол/i.test(i.name))).toBe(true);
    }
    expect((await listCatalogItems({ q: "парацетамол 500" })).total).toBe(2);
  });

  it("treats ё and е as the same letter", async () => {
    expect((await listCatalogItems({ q: "елочный" })).items[0]?.name).toMatch(/^Ёлочный/);
    expect((await listCatalogItems({ q: "ЁЛОЧНЫЙ" })).total).toBe(1);
  });

  it("searches by article", async () => {
    const res = await listCatalogItems({ q: "p-500" });
    expect(res.items.map((i) => i.article).sort()).toEqual(["P-500-10", "P-500-20"]);
    expect((await listCatalogItems({ q: "ASP-100" })).items[0]?.name).toMatch(/Аспирин/);
  });

  it("keeps products with the same article as separate items", async () => {
    const res = await listCatalogItems({ q: "DUP-001" });
    expect(res.total).toBe(2);
    expect(new Set(res.items.map((i) => i.id)).size).toBe(2);
    expect(new Set(res.items.map((i) => i.name)).size).toBe(2);
    // Same for the generated rows that share articles (T0 … T49).
    const t1 = await listCatalogItems({ q: "T1", pageSize: 48 });
    expect(t1.items.length).toBeGreaterThan(2);
  });

  it("is safe with special characters and treats LIKE wildcards literally", async () => {
    expect((await listCatalogItems({ q: "%" })).items.map((i) => i.article)).toEqual(["R_3"]);
    expect((await listCatalogItems({ q: "R_3" })).total).toBe(1);
    expect((await listCatalogItems({ q: "'; DROP TABLE public.pharmacy_products; --" })).total).toBe(0);
    expect(await tableCount()).toBeGreaterThan(100);
  });

  it("fixes the keyboard layout when nothing is found", async () => {
    const res = await listCatalogItems({ q: "gfhfwtnfvjk" });
    expect(res.layoutFixed).toBe(true);
    expect(res.total).toBe(3);
  });

  it("opens one item by its unique id and never invents price, stock or images", async () => {
    const first = (await listCatalogItems({ q: "Бинт стерильный" })).items.find((i) => i.name === "Бинт стерильный 7 м × 14 см")!;
    const item = await getCatalogItem(first.id);
    expect(item).toMatchObject({ id: first.id, article: "DUP-001", name: "Бинт стерильный 7 м × 14 см", price: null, stockQuantity: null, category: null, imageUrl: null });
    expect(await getCatalogItem("999999999999")).toBeNull();
    expect(isCatalogId("12")).toBe(true);
    for (const bad of ["0", "-1", "1e3", "abc", "1234567890123456789", "12 "]) expect(isCatalogId(bad), bad).toBe(false);
  });

  it("suggests matches for the header search", async () => {
    const res = await suggestCatalogItems("аспир");
    expect(res.items[0]?.article).toBe("ASP-100");
  });

  it("tokenises queries without breaking articles or decimals", () => {
    expect(catalogTokens(" «Ёлка», 0,5 ABC-123/1 ")).toEqual(["елка", "0,5", "abc-123/1"]);
  });

  it("loads favourites by id in the given order, skipping unknown and invalid ids", async () => {
    const page = await listCatalogItems({ pageSize: 3 });
    const [a, b, c] = page.items.map((i) => i.id);
    const res = await listCatalogItemsByIds([c, "999999999999", a, "abc", b, a]);
    expect(res.map((i) => i.id)).toEqual([c, a, b]);
    expect(await listCatalogItemsByIds([])).toEqual([]);
    expect(await listCatalogItemsByIds(["0", "-5", "x"])).toEqual([]);
  });

  it("shows a photo found by barcode with its credit, without touching pharmacy_products", async () => {
    const [item] = (await listCatalogItems({ q: "ASP-100", pageSize: 1 })).items;
    expect(item.imageUrl).toBeNull();
    await prisma.catalogImage.create({
      data: { barcode: "ASP-100", photoUrl: "https://images.example.org/asp.jpg", photoSource: "Open Food Facts", photoSourceUrl: "https://world.openfoodfacts.org/product/ASP-100", photoLicense: "CC BY-SA 3.0" },
    });
    try {
      const again = await getCatalogItem(item.id);
      expect(again?.imageUrl).toBe("https://images.example.org/asp.jpg");
      expect(again?.imageCredit).toEqual({ source: "Open Food Facts", url: "https://world.openfoodfacts.org/product/ASP-100", license: "CC BY-SA 3.0" });
      const [listed] = (await listCatalogItems({ q: "ASP-100", pageSize: 1 })).items;
      expect(listed.imageUrl).toBe("https://images.example.org/asp.jpg");
      // A non-https photo is never shown.
      await prisma.catalogImage.update({ where: { barcode: "ASP-100" }, data: { photoUrl: "http://images.example.org/asp.jpg" } });
      expect((await getCatalogItem(item.id))?.imageUrl).toBeNull();
    } finally {
      await prisma.catalogImage.delete({ where: { barcode: "ASP-100" } });
    }
  });

  it("home preview: up to 4 real products in a stable order, names starting with a letter first", async () => {
    const a = await listCatalogPreview(4);
    const b = await listCatalogPreview(4);
    expect(a).toHaveLength(Math.min(4, await tableCount()));
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    for (const item of a) {
      expect(item.name).toMatch(/^\p{L}/u);
      expect(item.price).toBeNull();
      expect(await getCatalogItem(item.id)).not.toBeNull();
    }
  });
});
