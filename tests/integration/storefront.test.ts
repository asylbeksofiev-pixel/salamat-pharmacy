import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getStorefrontState } from "@/server/storefront";
import { baseRows, cleanCatalog, csv, importCsv } from "./helpers";

describe("storefront state is derived from the data", () => {
  it("without prices: request mode for catalogue products, no category navigation", async () => {
    await cleanCatalog();
    const state = await getStorefrontState();
    // Catalogue products can be requested "to be confirmed" while some pharmacy accepts requests.
    expect(state.orderingEnabled).toBe(true);
    expect(state.pricesConfirmed).toBe(false);
    expect(state.categoryIdsWithProducts.size).toBe(0);
    const n = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`;
    expect(state.catalogTotal).toBe(Number(n[0].n));
  });

  it("enables them once published products with prices and categories exist", async () => {
    await cleanCatalog();
    await importCsv(csv(baseRows()), { publishNew: true });
    const state = await getStorefrontState();
    expect(state.orderingEnabled).toBe(true);
    expect(state.pricesConfirmed).toBe(true);
    expect(state.categoryIdsWithProducts.size).toBeGreaterThan(0);
    // Every category with products also marks its parent sections.
    const cats = await prisma.category.findMany({ where: { id: { in: [...state.categoryIdsWithProducts] } }, select: { parentId: true } });
    for (const c of cats) if (c.parentId) expect(state.categoryIdsWithProducts.has(c.parentId)).toBe(true);
  });

  it("turns requests off when no pharmacy accepts them", async () => {
    await cleanCatalog();
    const accepting = await prisma.pharmacy.findMany({ where: { acceptsOrders: true }, select: { id: true } });
    await prisma.pharmacy.updateMany({ data: { acceptsOrders: false } });
    try {
      const state = await getStorefrontState();
      expect(state.orderingEnabled).toBe(false);
    } finally {
      await prisma.pharmacy.updateMany({ where: { id: { in: accepting.map((p) => p.id) } }, data: { acceptsOrders: true } });
    }
  });
});
