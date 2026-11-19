import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { applyPlan, planClassification, rollbackRun, verifyClassification } from "@/server/catalog-classification";
import { countCatalogItemsByCategory, getCatalogItem, listCatalogItems, resetCatalogColumnsCache } from "@/server/catalog-items";
import { getStorefrontState } from "@/server/storefront";

async function cleanup() {
  await prisma.catalogItemCategoryChange.deleteMany();
  await prisma.catalogItemCategory.deleteMany();
  await prisma.catalogClassificationRun.deleteMany();
  await prisma.$executeRawUnsafe(`ALTER TABLE public.pharmacy_products DROP COLUMN IF EXISTS price`);
  resetCatalogColumnsCache();
}

const sectionId = async (slug: string) => (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;
const productCount = async () => Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`)[0].n);

describe("classification of public.pharmacy_products", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("dry run covers every product by id and writes nothing", async () => {
    const { items, stats, missingCategories } = await planClassification(prisma);
    expect(missingCategories).toEqual([]);
    expect(items).toHaveLength(await productCount());
    expect(new Set(items.map((i) => i.productId.toString())).size).toBe(items.length);
    expect(stats.create).toBe(items.length);
    expect(await prisma.catalogItemCategory.count()).toBe(0);
    // every product has a result: a published section, or "needs review"
    for (const it of items) expect(it.next.reviewStatus === "needs_review" || !!it.next.categoryId).toBe(true);
  });

  it("apply is repeatable, keeps manual confirmations, and rolls back exactly its own changes", async () => {
    const first = await planClassification(prisma);
    const run1 = await applyPlan(prisma, first.items, first.stats);
    let v = await verifyClassification(prisma);
    expect(v).toMatchObject({ missing: 0, orphans: 0, invalidCategory: 0, publishedWithoutCategory: 0, ok: true });
    expect(v.rows).toBe(await productCount());

    // Same rules again: nothing changes.
    const again = await planClassification(prisma);
    expect(again.stats).toMatchObject({ create: 0, update: 0, unchanged: first.items.length });

    // A person confirms a different section for one product; automatic runs never overwrite it.
    const target = first.items.find((i) => i.name.startsWith("Аспирин"))!;
    const hygiene = await sectionId("gigiena");
    await prisma.catalogItemCategory.update({ where: { productId: target.productId }, data: { categoryId: hygiene, reviewStatus: "confirmed", method: "manual:admin", confidence: 1 } });
    const third = await planClassification(prisma);
    expect(third.stats.keptConfirmed).toBe(1);
    await applyPlan(prisma, third.items, third.stats);
    expect((await prisma.catalogItemCategory.findUniqueOrThrow({ where: { productId: target.productId } })).categoryId).toBe(hygiene);

    // An override file entry is stored as confirmed.
    const bandage = first.items.find((i) => i.name.startsWith("Бинт стерильный"))!;
    const plan4 = await planClassification(prisma, { overrides: new Map([[bandage.productId.toString(), { slug: "medicinskie-pribory-i-izdeliya" as const, note: "проверено" }]]) });
    const run4 = await applyPlan(prisma, plan4.items, plan4.stats);
    const bandageRow = await prisma.catalogItemCategory.findUniqueOrThrow({ where: { productId: bandage.productId } });
    expect(bandageRow).toMatchObject({ reviewStatus: "confirmed", method: "manual:overrides-file", reason: "проверено" });

    // Rolling back run 4 restores the previous automatic row; rolling back run 1 deletes the rows it created
    // and still hold its values, but never the one a person confirmed afterwards.
    await rollbackRun(prisma, run4);
    expect((await prisma.catalogItemCategory.findUniqueOrThrow({ where: { productId: bandage.productId } })).reviewStatus).toBe(bandage.next.reviewStatus);
    const rb = await rollbackRun(prisma, run1);
    expect(rb.deleted).toBeGreaterThan(0);
    const left = await prisma.catalogItemCategory.findMany();
    expect(left.map((r) => r.productId.toString())).toEqual([target.productId.toString()]);
    expect(rb.skipped).toBe(1);
    await expect(rollbackRun(prisma, run1)).rejects.toThrow(/already rolled back/);
    v = await verifyClassification(prisma);
    expect(v.missing).toBe((await productCount()) - left.length);
  });
});

describe("catalogue filters and sorting over the whole table", () => {
  beforeAll(async () => {
    await cleanup();
    const plan = await planClassification(prisma);
    await applyPlan(prisma, plan.items, plan.stats);
  });
  afterAll(cleanup);

  it("sections reach the storefront and category pages show only their products", async () => {
    const store = await getStorefrontState();
    const meds = await sectionId("lekarstvennye-sredstva");
    expect(store.catalogCategoryCounts.get(meds)).toBeGreaterThan(0);
    expect(store.categoryIdsWithProducts.has(meds)).toBe(true);
    const page = await listCatalogItems({ categoryIds: [meds], pageSize: 48 });
    expect(page.total).toBe(store.catalogCategoryCounts.get(meds));
    expect(page.items.every((i) => i.categorySlug === "lekarstvennye-sredstva")).toBe(true);
    const item = await getCatalogItem(page.items[0].id, "en");
    expect(item?.category).toBe("Medicines");
  });

  it("several sections combine with OR; other filters with AND; counts match the listing", async () => {
    const a = await sectionId("lekarstvennye-sredstva");
    const b = await sectionId("medicinskie-pribory-i-izdeliya");
    const [ra, rb, rab] = await Promise.all([listCatalogItems({ categoryIds: [a] }), listCatalogItems({ categoryIds: [b] }), listCatalogItems({ categoryIds: [a, b] })]);
    expect(rab.total).toBe(ra.total + rb.total);
    const counts = await countCatalogItemsByCategory({});
    expect(counts.get(a)).toBe(ra.total);
    // search + section
    const search = await listCatalogItems({ q: "парацетамол", categoryIds: [a] });
    expect(search.total).toBeGreaterThan(0);
    expect(search.items.every((i) => /парацетамол/i.test(i.name))).toBe(true);
    // no prices in the table yet: any price filter gives nothing, without it nothing is hidden
    expect((await listCatalogItems({ hasPrice: true })).total).toBe(0);
    expect((await listCatalogItems({ priceMin: 1 })).total).toBe(0);
    expect((await listCatalogItems({})).total).toBe(await productCount());
  });

  it("pages never repeat or skip products with filters and every sort", async () => {
    const a = await sectionId("lekarstvennye-sredstva");
    for (const sort of ["name_asc", "name_desc"] as const) {
      const first = await listCatalogItems({ categoryIds: [a], sort, pageSize: 7 });
      const ids: string[] = [];
      for (let page = 1; page <= first.pageCount; page++) ids.push(...(await listCatalogItems({ categoryIds: [a], sort, page, pageSize: 7 })).items.map((i) => i.id));
      expect(ids).toHaveLength(first.total);
      expect(new Set(ids).size).toBe(first.total);
    }
  });

  it("with a price column: numeric price sort, products without a price last both ways, range excludes them", async () => {
    await prisma.$executeRawUnsafe(`ALTER TABLE public.pharmacy_products ADD COLUMN price numeric`);
    await prisma.$executeRawUnsafe(`UPDATE public.pharmacy_products SET price = CASE WHEN id % 3 = 0 THEN 1000 + id WHEN id % 3 = 1 THEN 0 END`);
    resetCatalogColumnsCache();
    const priced = Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products WHERE price > 0`)[0].n);
    const total = await productCount();
    for (const sort of ["price_asc", "price_desc"] as const) {
      const all: (number | null)[] = [];
      const first = await listCatalogItems({ sort, pageSize: 48 });
      expect(first.sort).toBe(sort);
      for (let page = 1; page <= first.pageCount; page++) all.push(...(await listCatalogItems({ sort, page, pageSize: 48 })).items.map((i) => i.price));
      expect(all).toHaveLength(total);
      const prices = all.slice(0, priced);
      expect(prices.every((p) => p !== null)).toBe(true);
      expect(all.slice(priced).every((p) => p === null)).toBe(true);
      const sorted = [...(prices as number[])].sort((x, y) => (sort === "price_asc" ? x - y : y - x));
      expect(prices).toEqual(sorted);
    }
    expect((await listCatalogItems({ hasPrice: true })).total).toBe(priced);
    const ranged = await listCatalogItems({ priceMin: 1050, priceMax: 1090, pageSize: 48 });
    expect(ranged.items.every((i) => i.price !== null && i.price >= 1050 && i.price <= 1090)).toBe(true);
    expect((await listCatalogItems({})).total).toBe(total);
  });
});
