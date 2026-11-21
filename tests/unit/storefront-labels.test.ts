import { describe, expect, it } from "vitest";
import { cartSummary } from "@/lib/cart-summary";
import { pluralWord } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { PROMO_BANNERS, visibleBanners } from "@/config/promo-banners";
import { visibilityCandidates } from "../../scripts/catalog-visibility";

describe("cart counters", () => {
  it("say positions and units in three languages", () => {
    expect(cartSummary(getDictionary("ru"), "ru", { positions: 1, units: 2 })).toBe("1 позиция · 2 шт.");
    expect(cartSummary(getDictionary("ru"), "ru", { positions: 3, units: 5 })).toBe("3 позиции · 5 шт.");
    expect(cartSummary(getDictionary("ru"), "ru", { positions: 5, units: 11 })).toBe("5 позиций · 11 шт.");
    expect(cartSummary(getDictionary("en"), "en", { positions: 1, units: 2 })).toBe("1 item · 2 pcs");
    expect(cartSummary(getDictionary("kk"), "kk", { positions: 2, units: 3 })).toBe("2 позиция · 3 дана");
    expect(pluralWord(21, "a|b|c", "ru")).toBe("a");
  });
});

describe("home service banners", () => {
  it("hide the promotions banner while no promotion is published", () => {
    const none = visibleBanners(PROMO_BANNERS, { promotions: false });
    expect(none.some((b) => b.href === "/promotions")).toBe(false);
    expect(none.length).toBe(PROMO_BANNERS.length - 1);
    expect(visibleBanners(PROMO_BANNERS, { promotions: true })).toHaveLength(PROMO_BANNERS.length);
  });
});

describe("service positions for a decision by SALAMAT", () => {
  it("flags accounting notes, not ordinary kits or missing barcodes, and hides nothing", () => {
    const list = visibilityCandidates([
      { id: "1594", article: "Комплектующая для №100", name: "Парацетамол 500 мг № 10 Эйкос-Фарм Комплект", category: null },
      { id: "10365", article: "2000994074481", name: "Альбезол таблетки 400 мг № 6 (№30) ФАСОВКА", category: null },
      { id: "7035", article: "4015630070725", name: "Акку-Чек (Accu-Chek) Глюкометр Инстант комплект (ТОО)", category: null },
      { id: "7469", article: "4015672111202", name: "Омрон Набор комплектующих для С101, С102 в коробке 202", category: null },
      { id: "8206", article: "A4030096589079A", name: "Амбробене Раствор 15 мг/2 мл № 5", category: null },
    ]);
    const byId = new Map(list.map((c) => [c.id, c]));
    expect(byId.get("1594")?.signal).toMatch(/служебная.*в артикуле/);
    expect(byId.get("10365")?.signal).toMatch(/Фасовка/);
    expect(byId.has("7035")).toBe(false);
    expect(byId.has("7469")).toBe(false);
    expect(byId.get("8206")?.signal).toBe("артикул не похож на штрихкод");
  });
});
