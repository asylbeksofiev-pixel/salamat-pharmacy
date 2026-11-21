import { describe, expect, it } from "vitest";
import { baseName, nameDetails, productFeatures } from "@/lib/product-features";
import { pickSimilar, pickVaried, similarityScore } from "@/server/recommendations";
import { spreadAcrossSections } from "@/server/home-catalog";
import type { CatalogItem } from "@/server/catalog-items";

const item = (id: string, name: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  article: null,
  name,
  price: null,
  stockQuantity: null,
  category: null,
  categorySlug: null,
  imageUrl: null,
  imageCredit: null,
  ...extra,
});

describe("product features read from the name", () => {
  it("brand, line, type and the same product in another size", () => {
    const f = productFeatures("Биодерма (Bioderma) Sebium Мицеллярная вода 500 мл 851/013");
    expect(f).toMatchObject({ key: "биодерма", line: "sebium", type: "micellar" });
    expect(baseName("Биодерма (Bioderma) Sebium Мицеллярная вода 250 мл 297")).toBe(f.base);
    expect(productFeatures("Altyn Bala  Подгузники р-р L (9 -14кг) 48 шт")).toMatchObject({ key: "altyn", type: "nappies", form: null });
    expect(productFeatures("Биолан Крем защитный заживляющий для смены подгузников 100 мл").type).toBe("cream");
  });

  it("characteristics only as written: form, dose, volume, one clear pack count", () => {
    expect(nameDetails("Парацетамол Nobel суспензия д/детей 120мг/5мл, 100 мл")).toEqual({ form: "suspension", contents: ["100 мл"], count: null, dosages: ["120 мг/5мл"] });
    expect(nameDetails("Altyn Bala  Подгузники р-р L (9 -14кг) 48 шт")).toEqual({ form: null, contents: [], count: 48, dosages: [] });
    expect(nameDetails("Парацетамол таблетки 500 мг № 10 Жанафарм")).toMatchObject({ form: "tablet", count: 10, dosages: ["500 мг"] });
    expect(nameDetails("Аптечка автомобильная")).toEqual({ form: null, contents: [], count: null, dosages: [] });
  });
});

describe("similar products", () => {
  const micellar = item("1417", "Биодерма (Bioderma) Sebium Мицеллярная вода 500 мл 851/013");
  const candidates = [
    item("1", "Биодерма (Bioderma) Sebium Гель-мусс очищающий 200 мл"), // other type
    item("2", "Урьяж (Uriage) Мицеллярная вода 250 мл"), // same type, other brand
    item("3", "Биодерма (Bioderma) Sensibio Н2О Мицеллярная вода 250 мл"), // same type and brand
    item("4", "Биодерма (Bioderma) Sebium Мицеллярная вода 250 мл 297"), // same line
    item("5", "Биодерма (Bioderma) Sebium Мицеллярная вода 250 мл 297"), // same name again (another id)
    item("1417", micellar.name), // the product itself
    item("6", "Биодерма (Bioderma) Набор Sebium Мицеллярная вода 500 мл 1+1"), // a set
  ];

  it("uses the product type, then brand and line; never the product itself, other types or repeated names", () => {
    const ids = pickSimilar(micellar, candidates, false).map((i) => i.id);
    expect(ids[0]).toBe("4");
    expect(ids).toContain("3");
    expect(ids).toContain("2");
    expect(ids).not.toContain("1");
    expect(ids).not.toContain("1417");
    expect(ids.filter((id) => id === "4" || id === "5")).toHaveLength(1);
    expect(ids.indexOf("6")).toBeGreaterThan(ids.indexOf("2")); // sets after single products
  });

  it("for medicines only the same name counts (no other medicines as alternatives), same form first", () => {
    const cur = productFeatures("Парацетамол Nobel суспензия д/детей 120мг/5мл, 100 мл");
    expect(similarityScore(cur, productFeatures("Ибупрофен суспензия 100 мг/5 мл"), true)).toBeNull();
    const susp = similarityScore(cur, productFeatures("Парацетамол суспензия для приема внутрь 120 мг/5 мл 100 мл"), true)!;
    const tabs = similarityScore(cur, productFeatures("Парацетамол таблетки 500 мг № 10"), true)!;
    expect(susp).toBeGreaterThan(tabs);
  });

  it("is stable: the same input gives the same order", () => {
    expect(pickSimilar(micellar, [...candidates].reverse(), false).map((i) => i.id)).toEqual(pickSimilar(micellar, candidates, false).map((i) => i.id));
  });

  it("'other products' keep one size per product and at most two per brand", () => {
    const list = [
      item("a", "Tomiko Подгузник р-р L 9-13 кг № 56"),
      item("b", "Tomiko Подгузник р-р М 5-10 кг № 64"),
      item("c", "Tomiko Трусики р-р L 9-14 кг № 46"),
      item("d", "Tomiko Бутылочка 150 мл"),
      item("e", "Агуша Пюре яблоко 115 гр"),
    ];
    expect(pickVaried(list, new Set()).map((i) => i.id)).toEqual(["a", "c", "e"]);
  });
});

describe("home page selection", () => {
  it("takes turns between sections and skips repeated brands and sizes", () => {
    const c = (id: string, sectionId: string, name: string) => ({ ...item(id, name), sectionId });
    const out = spreadAcrossSections(
      [
        c("1", "baby", "Altyn Bala Подгузники р-р L 48 шт"),
        c("2", "baby", "Altyn Bala Подгузники р-р M 52 шт"),
        c("3", "baby", "Altyn Bala Трусики р-р XL 40 шт"),
        c("4", "baby", "Агуша Пюре яблоко 115 гр"),
        c("5", "cosm", "Биодерма Sebium Мицеллярная вода 500 мл"),
        c("6", "med", "Нурофен таблетки 200 мг № 10"),
      ],
      ["baby", "cosm", "med"],
      5,
    );
    expect(out.map((i) => i.id)).toEqual(["1", "5", "6", "4"]);
  });
});
