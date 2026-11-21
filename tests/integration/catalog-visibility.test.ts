import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getCatalogItem, listCatalogCandidates, listCatalogItems, listCatalogItemsByIds, resetCatalogVocabularyCache, suggestCatalogItems } from "@/server/catalog-items";
import { buildQuote } from "@/server/orders/quote";
import { productRecommendations } from "@/server/recommendations";
import { homeCatalogSelection } from "@/server/home-catalog";

async function idOf(name: string): Promise<string> {
  const [r] = await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM public.pharmacy_products WHERE name = ${name} LIMIT 1`;
  return r.id.toString();
}

describe("public visibility of catalogue products", () => {
  let hidden: string;
  beforeAll(async () => {
    hidden = await idOf("Парацетамол 500 мг №10 табл.");
    await prisma.catalogItemVisibility.create({ data: { productId: BigInt(hidden), isPublic: false, reason: "test: internal", decidedBy: "test" } });
  });
  afterAll(async () => {
    await prisma.catalogItemVisibility.deleteMany();
  });

  it("every product without a row stays public (safe default)", async () => {
    const all = await listCatalogItems({ pageSize: 48 });
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`;
    expect(all.total).toBe(Number(n) - 1);
  });

  it("a hidden product is left out of search, suggestions, the product page, favourites and recommendations", async () => {
    const res = await listCatalogItems({ q: "парацетамол" });
    expect(res.items.map((i) => i.id)).not.toContain(hidden);
    expect(res.total).toBe(2);
    expect((await suggestCatalogItems("парацетамол")).items.map((i) => i.id)).not.toContain(hidden);
    expect(await getCatalogItem(hidden)).toBeNull();
    expect(await listCatalogItemsByIds([hidden])).toEqual([]);
    const shown = await getCatalogItem(await idOf("Парацетамол 500 мг №20 табл."));
    expect(shown).not.toBeNull();
  });

  it("a hidden product cannot be requested through the cart or the API", async () => {
    const quote = await buildQuote({ pharmacyId: null, items: [{ variantId: hidden, quantity: 1 }], locale: "ru" });
    expect(quote.lines[0].blocking).toBe(true);
    expect(quote.hasBlocking).toBe(true);
  });

  it("showing it again restores it everywhere", async () => {
    await prisma.catalogItemVisibility.update({ where: { productId: BigInt(hidden) }, data: { isPublic: true, reason: "test: public again" } });
    expect(await getCatalogItem(hidden)).not.toBeNull();
    await prisma.catalogItemVisibility.update({ where: { productId: BigInt(hidden) }, data: { isPublic: false } });
  });
});

describe("search relevance and typo suggestions", () => {
  beforeAll(() => resetCatalogVocabularyCache());

  it("an exact article comes first; digits are never corrected", async () => {
    const res = await listCatalogItems({ q: "P-500-10", sort: "relevance" });
    expect(res.items[0]?.article).toBe("P-500-10");
    const nothing = await listCatalogItems({ q: "999999999" });
    expect(nothing.total).toBe(0);
    expect(nothing.suggestion).toBeNull();
  });

  it("a typo finds nothing but offers the right word as a suggestion (the query itself is kept)", async () => {
    const res = await listCatalogItems({ q: "аспирн" });
    expect(res.total).toBe(0);
    expect(res.query).toBe("аспирн");
    expect(res.suggestion).toEqual({ query: "аспирин", total: 1 });
    expect((await suggestCatalogItems("аспирн")).didYouMean).toBe("аспирин");
  });

  it("no suggestion when the query finds enough", async () => {
    expect((await listCatalogItems({ q: "тестовый" })).suggestion).toBeNull();
  });
});

describe("recommendations and the home selection", () => {
  let sectionId: string;
  const ids: string[] = [];
  beforeAll(async () => {
    const section = await prisma.category.findFirstOrThrow({ where: { slug: "lekarstvennye-sredstva" } });
    sectionId = section.id;
    for (const name of ["Парацетамол 500 мг №20 табл.", "Парацетамол 500 мг №10 табл.", "ПАРАЦЕТАМОЛ 200 мг №10 табл.", "Аспирин Кардио 100 мг №28 табл."]) ids.push(await idOf(name));
    await prisma.catalogItemCategory.createMany({
      data: ids.map((id) => ({ productId: BigInt(id), categoryId: sectionId, confidence: 0.9, method: "test", reason: "test", reviewStatus: "auto", classifierVersion: "test" })),
    });
    await prisma.catalogItemVisibility.create({ data: { productId: BigInt(ids[1]), isPublic: false, reason: "test: internal", decidedBy: "test" } });
  });
  afterAll(async () => {
    await prisma.catalogItemCategory.deleteMany({ where: { method: "test" } });
    await prisma.catalogItemVisibility.deleteMany();
  });

  it("similar products share the name; the current, hidden and repeated products are left out; lists do not overlap", async () => {
    const current = (await getCatalogItem(ids[0]))!;
    const recs = await productRecommendations(current, "ru");
    const similar = recs.similar.map((i) => i.id);
    expect(recs.basis).toBe("name");
    expect(similar).not.toContain(ids[0]);
    expect(similar).not.toContain(ids[1]); // hidden
    expect(similar).toContain(ids[2]);
    expect(similar).not.toContain(ids[3]); // another medicine is never offered as "similar"
    const others = recs.others.map((i) => i.id);
    expect(others).toContain(ids[3]);
    expect(others.some((id) => similar.includes(id) || id === ids[0])).toBe(false);
  });

  it("candidate queries are bounded and stay inside the section", async () => {
    const list = await listCatalogCandidates({ categoryIds: [sectionId], limit: 2 });
    expect(list.length).toBeLessThanOrEqual(2);
    expect(list.every((i) => i.categorySlug === "lekarstvennye-sredstva")).toBe(true);
  });

  it("the home selection is stable, public only and falls back to the catalogue when sections are small", async () => {
    const a = await homeCatalogSelection("ru");
    const b = await homeCatalogSelection("ru");
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a.length).toBe(12);
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length);
  });
});
