import { describe, expect, it } from "vitest";
import { brandConfirmed, nameSimilarity, sameWord, significantWords, translit } from "@/lib/catalog-photos/similarity";
import { assessNctCard, type NctCard } from "@/lib/catalog-photos/nct-match";
import { queryWords, safeQuery } from "../../scripts/catalog-photos/nct";

const card = (over: Partial<NctCard> = {}): NctCard => ({
  id: 1,
  name: "Мармелад 7JELLY Cola, 35 гр",
  gtin: "8684207816361",
  ntin: null,
  kztin: null,
  images: ["https://nationalcatalog.kz/gw/storage/api/v1/public/cdn/download/x.jpg"],
  category: null,
  form: null,
  manufacturer: "Ceremony",
  ...over,
});

describe("name similarity", () => {
  it("compares words across alphabets and spellings", () => {
    expect(translit("Бюбхен")).toBe(translit("Bubchen"));
    expect(translit("Buebchen")).toBe(translit("Бюбхен"));
    expect(sameWord("алфавит", "alfavit")).toBe(true);
    expect(sameWord("кола", "cola")).toBe(true);
    expect(sameWord("дыня", "малина")).toBe(false);
  });

  it("keeps only significant words", () => {
    expect(significantWords("АлфаВИТ Классик таблетки № 60")).toEqual(["алфавит", "классик"]);
    expect(significantWords("Мармелад 7JELLY Cola, 35 гр")).toEqual(["мармелад", "jelly", "cola"]);
    expect(significantWords("Парацетамол 500 мг № 10 Эйкос-Фарм")).toEqual(["парацетамол", "эйкос"]);
  });

  it("measures coverage both ways (another flavour shows up as missing and extra words)", () => {
    const s = nameSimilarity("Бюбхен Шампунь детский и гель для душа Ароматная Дыня 230 мл", "БЮБХЕН ШАМПУНЬ И ГЕЛЬ ДЛЯ ДУША 2В1 ДЕТСКИЙ 230мл СЛАДКАЯ МАЛИНА");
    expect(s.missing).toEqual(["ароматная", "дыня"]);
    expect(s.extra).toEqual(expect.arrayContaining(["сладкая", "малина"]));
  });

  it("checks that the brand of the SALAMAT name is on the card", () => {
    expect(brandConfirmed("Бюбхен Шампунь Тигр 230 мл", "Шампунь-гель Bubchen Тигр 230мл", null)).toBe(true);
    expect(brandConfirmed("Бюбхен Шампунь Тигр 230 мл", "BUTCHER Шампунь Тигр 230 мл", "BUTCHER")).toBe(false);
    expect(brandConfirmed("Алцеф капсулы 300 мг", "Капсулы 300 мг", "Alcef Pharma")).toBe(true);
  });
});

describe("NCT card grading", () => {
  const product = { name: "7 Jelly Cola мармелад зубы 35 гр", article: "8684207816361" };

  it("confirms the same barcode with matching characteristics and brand", () => {
    const a = assessNctCard(product, card());
    expect(a).toMatchObject({ grade: "confirmed", method: "gtin_exact" });
  });

  it("flags another package of the same barcode family as mismatch", () => {
    expect(assessNctCard(product, card({ name: "Мармелад 7JELLY Cola, 90 гр" })).grade).toBe("mismatch");
  });

  it("keeps a barcode match without the brand on the card at probable", () => {
    const a = assessNctCard({ name: "Бюбхен Шампунь Тигр 230 мл", article: "4065331001108" }, card({ name: "BUTCHER Шампунь Тигр 230 мл", gtin: "4065331001108", manufacturer: "BUTCHER" }));
    expect(a.grade).toBe("probable");
    expect(a.reasons).toContain("brand_not_on_card");
  });

  it("never confirms a match found by name only", () => {
    const a = assessNctCard({ name: "АлфаВИТ Классик таблетки № 60", article: "4660014182244" }, card({ name: "Алфавит Классик таб. №60", gtin: null, manufacturer: "ВТФ" }));
    expect(a.method).toBe("name");
    expect(a.grade).toBe("probable");
  });

  it("treats another flavour found by name as doubtful at best", () => {
    const a = assessNctCard(
      { name: "Бюбхен Шампунь детский и гель для душа Ароматная Дыня 230 мл", article: "4065331002051" },
      card({ name: "БЮБХЕН ШАМПУНЬ И ГЕЛЬ ДЛЯ ДУША 2В1 ДЕТСКИЙ 230мл СЛАДКАЯ МАЛИНА", gtin: null }),
    );
    expect(["doubtful", "unrelated"]).toContain(a.grade);
  });

  it("does not let a manufacturer's box stand for SALAMAT's own repack", () => {
    const a = assessNctCard({ name: "Альбезол таблетки 400 мг № 6 (№30) ФАСОВКА", article: "2000994074481" }, card({ name: "Альбезол®, таблетки, 400 мг №30", gtin: "4870004334205" }));
    expect(a.grade).toBe("doubtful");
    expect(a.reasons).toContain("salamat_repack");
  });

  it("keeps one flavour's photo for an assortment at probable", () => {
    const a = assessNctCard({ name: "7 Jelly мармелад В АССОРТИМЕНТЕ 80 гр", article: "8684207811588" }, card({ name: "Мармелад 7JELLY FruitGarden, 80 гр", gtin: "8684207811588" }));
    expect(a.grade).toBe("probable");
    expect(a.reasons).toContain("salamat_assortment");
  });

  it("matches NTIN / KZTIN written in the article", () => {
    expect(assessNctCard({ name: "Парацетамол таб. 500мг №10", article: "0200091351320" }, card({ name: "Парацетамол-УБФ таб. 500мг №10", gtin: null, ntin: "0200091351320" })).method).toBe("ntin_exact");
  });
});

describe("NCT queries", () => {
  it("never sends a bare barcode (the public API fails on it)", () => {
    expect(safeQuery("4660014182244")).toBeNull();
    expect(safeQuery("Аспиратор 38023682")).toBe("Аспиратор 38023682");
    expect(safeQuery(' "Бюбхен" ')).toBe("Бюбхен");
  });

  it("builds search words from brand and product words", () => {
    expect(queryWords("(Gufolino) Бутылочка д/кормления 125 мл")[0]).toBe("Gufolino");
    expect(queryWords("АлфаВИТ Классик таблетки № 60").slice(0, 2)).toEqual(["АлфаВИТ", "Классик"]);
  });
});
