import { describe, expect, it } from "vitest";
import { AUTO_THRESHOLD, CATEGORY_SLUGS, classifyName, normalizeName } from "@/lib/catalog-classify";
import { csvField, parseCsv, parseCsvObjects, toCsv } from "@/lib/csv";
import { activeFilterCount, catalogQueryString, effectiveSort, parseCatalogQuery } from "@/lib/catalog-params";

const cat = (name: string) => classifyName(name).category;
const auto = (name: string) => classifyName(name).reviewStatus === "auto";

describe("catalogue classification rules", () => {
  it("normalises names: case, ё, abbreviations like д/", () => {
    expect(normalizeName("Ёлка Гель д/интим.гигиены")).toContain("елка гель для интим.гигиены");
  });

  it("follows the section boundaries from the brief", () => {
    // oral care
    expect(cat("Лакалут Medium зуб щетка 363")).toBe("uhod-za-polostyu-rta");
    expect(cat("Curasept (Курасепт) Зубная нить Floss Classico 489")).toBe("uhod-za-polostyu-rta");
    expect(cat("EXXE Ополаскиватель Экстрасвежесть 250 мл")).toBe("uhod-za-polostyu-rta");
    // devices and supplies
    expect(cat("Тонометр механический Dr Frei A-20 Classic")).toBe("medicinskie-pribory-i-izdeliya");
    expect(cat("Термометр медицинский цифровой LС-211")).toBe("medicinskie-pribory-i-izdeliya");
    expect(cat("Игла Micro-Fine Plus 32G 4мм (0,23) № 100")).toBe("medicinskie-pribory-i-izdeliya");
    expect(cat("Dr.Pi Бинт марлевый стерильный 7мх14см Навтекс")).toBe("medicinskie-pribory-i-izdeliya");
    // cosmetics
    expect(cat("Урьяж (Uriage) Age Absolu сыворотка-бустер коллаген для лица с ретинолом 30 мл")).toBe("lechebnaya-kosmetika");
    expect(cat("Биодерма (Bioderma) Sebium Мицеллярная вода 250 мл 297")).toBe("lechebnaya-kosmetika");
    // mother and baby
    expect(cat("Памперс Premium Care 3 (для детей от 6 до 10 кг) 18 шт")).toBe("mama-i-malysh");
    expect(cat("Авент Пустышка Philips ultrasoft 0-6 мес 2 шт")).toBe("mama-i-malysh");
    expect(cat("Нан-3 (с 12 месяцев) 400 гр")).toBe("mama-i-malysh");
    // adult hygiene is not "mother and baby"
    expect(cat("Белла прокладки Classic Nova Comfort №10")).toBe("gigiena");
    expect(cat("TENA урологические прокладки Lady Slim Ultra Mini 28 шт")).toBe("gigiena");
    // herbs
    expect(cat("Зерде фито-чай Мочегонный 1,5 гр № 20")).toBe("travy-i-sbory");
    // food
    expect(cat("Нутридринк Компакт Протеин со вкусом персика и манго 125 мл")).toBe("pravilnoe-pitanie");
  });

  it("keeps children's medicines in medicines, and medicinal creams out of cosmetics", () => {
    expect(cat("Нурофен для детей суспензия 100 мг/5 мл 100 мл")).toBe("lekarstvennye-sredstva");
    expect(cat("Клотримазол крем 1% 15 гр Фармаприм")).toBe("lekarstvennye-sredstva");
    expect(cat("Адвантан Крем 0,1% 15 гр")).toBe("lekarstvennye-sredstva");
    expect(cat("Эпиген Интим спрей 0,1% 60 мл")).toBe("lekarstvennye-sredstva");
    expect(cat("Ибупрофен-Тева таблетки 200 мг № 20")).toBe("lekarstvennye-sredstva");
  });

  it("does not declare vitamin products dietary supplements without a sign", () => {
    const plain = classifyName("Витамин D3 капли 500 МЕ 10 мл");
    expect(plain.category).toBe("vitaminy-i-bady");
    expect(plain.reviewStatus).toBe("needs_review");
    // a supplement brand line or the word "БАД" is such a sign
    expect(auto("Солгар Витамин К2 капсулы 100 мкг № 50")).toBe(true);
    expect(classifyName("Комплекс витаминов БАД таблетки № 30").method).toBe("rule:supplements.explicit");
  });

  it("leaves uncertain products for review instead of guessing", () => {
    const sea = classifyName("Аква Марис Норм назальный спрей 150 мл");
    expect(sea.reviewStatus).toBe("needs_review");
    const capsules = classifyName("Остодок капсулы № 90");
    expect(capsules.reviewStatus).toBe("needs_review");
    const unknown = classifyName("Аромадиффузор Манго 50 мл");
    expect(unknown.reviewStatus).toBe("needs_review");
    expect(classifyName("").category).toBeNull();
  });

  it("returns only known sections, a confidence in range, a method and a reason", () => {
    for (const name of ["Тонометр", "Аспирин Кардио 100 мг №28 табл.", "Непонятный товар 1", "Шампунь 200 мл"]) {
      const c = classifyName(name);
      if (c.category) expect(CATEGORY_SLUGS).toContain(c.category);
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(c.method).toMatch(/^rule:/);
      expect(c.reason.length).toBeGreaterThan(5);
      expect(c.reviewStatus).toBe(c.category && c.confidence >= AUTO_THRESHOLD ? "auto" : "needs_review");
    }
  });

  it("is deterministic", () => {
    const name = "Биодерма (Bioderma) Atoderm Масло для душа 500 мл";
    expect(classifyName(name)).toEqual(classifyName(name));
  });
});

describe("CSV", () => {
  it("quotes fields with commas, quotes and line breaks and round-trips them", () => {
    expect(csvField('Крем "Детский", 50 мл')).toBe('"Крем ""Детский"", 50 мл"');
    expect(csvField(" ведущий пробел")).toBe('" ведущий пробел"');
    expect(csvField(null)).toBe("");
    const text = toCsv(["id", "name"], [["1", 'a,"b"\nc'], ["2", "простое"]]);
    expect(text.startsWith("﻿")).toBe(true);
    expect(parseCsv(text)).toEqual([["id", "name"], ["1", 'a,"b"\nc'], ["2", "простое"]]);
    expect(parseCsvObjects("product_id,category_slug,note\r\n12,gigiena,\"проверено, ок\"\r\n")).toEqual([{ product_id: "12", category_slug: "gigiena", note: "проверено, ок" }]);
  });
});

describe("catalogue URL parameters", () => {
  const known = new Set(["gigiena", "uhod-za-polostyu-rta", "mama-i-malysh"]);

  it("validates and normalises every parameter without throwing", () => {
    const q = parseCatalogQuery(
      { q: "  парацетамол   500 ", category: ["gigiena,uhod-za-polostyu-rta", "GIGIENA", "unknown", "<script>"], priceMin: "5000", priceMax: "100", hasPhoto: "1", hasPrice: "yes", sort: "price_desc", page: "3" },
      { known },
    );
    expect(q).toEqual({ q: "парацетамол 500", categories: ["gigiena", "uhod-za-polostyu-rta"], priceMin: 100, priceMax: 5000, hasPrice: false, hasPhoto: true, sort: "price_desc", page: 3 });
    const bad = parseCatalogQuery({ priceMin: "-1", priceMax: "1e9", sort: "drop table", page: "0" });
    expect(bad.priceMin).toBeUndefined();
    expect(bad.priceMax).toBeUndefined();
    expect(bad.sort).toBeNull();
    expect(bad.page).toBe(1);
    expect(parseCatalogQuery(new URLSearchParams("page=999999")).page).toBe(1);
    expect(parseCatalogQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("builds stable URLs; changing a filter resets the page, pagination keeps everything", () => {
    const q = parseCatalogQuery({ q: "крем", category: ["uhod-za-polostyu-rta", "gigiena"], hasPhoto: "1", sort: "name_desc", page: "4" }, { known });
    expect(catalogQueryString(q, { hasPhoto: false })).toBe("?q=%D0%BA%D1%80%D0%B5%D0%BC&category=gigiena&category=uhod-za-polostyu-rta&sort=name_desc");
    expect(catalogQueryString(q, { page: 5 })).toContain("page=5");
    expect(catalogQueryString(q, { page: 5 })).toContain("hasPhoto=1");
    expect(activeFilterCount(q)).toBe(3);
  });

  it("falls back from unavailable sorts", () => {
    expect(effectiveSort({ q: "", sort: null }, { prices: false, popularity: false })).toBe("name_asc");
    expect(effectiveSort({ q: "аспирин", sort: null }, { prices: false, popularity: false })).toBe("relevance");
    expect(effectiveSort({ q: "", sort: "relevance" }, { prices: true, popularity: false })).toBe("name_asc");
    expect(effectiveSort({ q: "", sort: "price_asc" }, { prices: false, popularity: false })).toBe("name_asc");
    expect(effectiveSort({ q: "", sort: "price_asc" }, { prices: true, popularity: false })).toBe("price_asc");
    expect(effectiveSort({ q: "", sort: "popular" }, { prices: true, popularity: false })).toBe("name_asc");
  });
});
