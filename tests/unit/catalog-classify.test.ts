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

  // Errors seen on the site (2026-11-21): "р-р" means "размер" (size) in nappies, pants, pacifiers and belts, not
  // "раствор"; sugar-free dragée sweets are confectionery, not a dosage form.
  it("reads «р-р» as a size for nappies, pants, pacifiers and supports, not as a solution", () => {
    expect(cat("Altyn Bala  Подгузники р-р L (9 -14кг) 48 шт")).toBe("mama-i-malysh");
    expect(cat("Altyn Bala Трусики р-р ХХL (15кг+) 36 шт")).toBe("mama-i-malysh");
    expect(cat("Tomiko Подгузник Comfort+ р-р Nb 2-5 кг № 21")).toBe("mama-i-malysh");
    expect(cat("Хаггис Трусики-Подгузн.д/плавания р-р 3-4 (7-15 кг) № 13")).toBe("mama-i-malysh");
    expect(cat("Молфикс(Molfix) Трусы одноразовые д/плавания р-р 4-5 № 11")).toBe("mama-i-malysh");
    expect(cat("НИП (NIP) Соска-пустышка Butterfly силикон р-р 3 (16-32 мес)")).toBe("mama-i-malysh");
    expect(cat("Депенд Нижнее белье для женщин р-р L/XL 9 шт")).toBe("gigiena");
    expect(cat("Корректоры осанки  р-р 1 01914")).toBe("medicinskie-pribory-i-izdeliya");
    expect(cat("Ремед Пояс поддерживающий с ребрами жесткости р-р REMED XL R3205")).toBe("medicinskie-pribory-i-izdeliya");
    // still a solution where it really is one
    expect(cat("Левомицетин 1 % 10 мл р-р Фармация")).toBe("lekarstvennye-sredstva");
    expect(cat("Папаверина гидрохлорид р-р для иньекций 2% 2 мл № 10 БЗМП")).toBe("lekarstvennye-sredstva");
    expect(cat("Роцефин порошок для иньекций 1 гр + 3,5 мл 1% р-р лидокаина № 1")).toBe("lekarstvennye-sredstva");
    // adult and menstrual pants are hygiene; postpartum pants are for the mother, like postpartum pads
    expect(cat("Seni Super Medium 2 Подгузники для взрослых № 10 189/536/352")).toBe("gigiena");
    expect(cat("Котекс Трусы послеродовые р-р L/XL 8 шт")).toBe("mama-i-malysh");
    expect(cat("Aiwina Трусики менструальные L/XL 3шт")).toBe("gigiena");
  });

  it("treats sweets sold by weight as food, while medicinal dragées and lozenges stay medicines", () => {
    expect(cat("Afee Драже без сахара 20 гр Клубника")).toBe("pravilnoe-pitanie");
    expect(cat("Yumearth Драже органические фруктовые 40 гр")).toBe("pravilnoe-pitanie");
    expect(cat("АГУША Пастилки фруктовое Яблоко 12 гр")).toBe("mama-i-malysh");
    expect(cat("Nut Vinograd детские пастилки из фруктов Вишня 40 гр")).toBe("mama-i-malysh");
    expect(cat("Карсил драже № 80")).toBe("lekarstvennye-sredstva");
    expect(cat("Курантил драже 25 мг № 120")).toBe("lekarstvennye-sredstva");
    expect(cat("Аджисепт с Медом пастилки № 24")).toBe("lekarstvennye-sredstva");
  });

  it("fixes other section errors found in the same check", () => {
    // contact lens care is not a medicine
    expect(cat("Раствор для линз Реню Мультиплюс 360 мл")).toBe("medicinskie-pribory-i-izdeliya");
    // dental plaque indicator tablets are oral care
    expect(cat("Plack Test Таблетки для индикации зубного налета № 12")).toBe("uhod-za-polostyu-rta");
    // laundry products: hygiene, or "mother and baby" when made for children's clothes
    expect(cat("YokoSun (ЙокоСан) Гель для стирки Горный эдельвейс 1 литр")).toBe("gigiena");
    expect(cat("Tomiko Гель для стирки Color д/цветных тканей 1 литр")).toBe("gigiena");
    expect(cat("Биолан Жидкость для стирки детского белья 750 мл 028")).toBe("mama-i-malysh");
    // infusions and prefilled syringes with a solution are medicines; infusion sets stay devices
    expect(cat("Оликлиномель N7 эмульсия для инфузий 1000 ЕД 1500 мл № 4")).toBe("lekarstvennye-sredstva");
    expect(cat("Катенокс готовый шприц раствор для инъекций 4000 анти-Ха МЕ/0,4 мл № 10")).toBe("lekarstvennye-sredstva");
    expect(cat("Система для инфузий Vogt Medical")).toBe("medicinskie-pribory-i-izdeliya");
    expect(cat("Шприц 5 мл 3-х компонентный № 100")).toBe("medicinskie-pribory-i-izdeliya");
        // supplement brand lines written with an apostrophe
    expect(cat("Nature's Bounty L-Лизин 1000 мг таблетки № 60")).toBe("vitaminy-i-bady");
    expect(cat("Animal Parade для иммунитета детей таблетки жевательные № 90")).toBe("vitaminy-i-bady");
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
