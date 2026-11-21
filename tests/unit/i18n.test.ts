import { describe, expect, it } from "vitest";
import ru from "@/lib/i18n/ru";
import kk from "@/lib/i18n/kk";
import en from "@/lib/i18n/en";
import { categoryName, cityName, hasOwnTranslation, localizedPath, locales, pickLocalized, splitLocale } from "@/lib/i18n/config";

type Tree = { [k: string]: string | Tree };
function flatten(t: Tree, prefix = ""): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}

const fr = flatten(ru as unknown as Tree);
const fk = flatten(kk as unknown as Tree);
const fe = flatten(en as unknown as Tree);
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("translations", () => {
  it("have the same keys in Russian, Kazakh and English", () => {
    expect(Object.keys(fk).sort()).toEqual(Object.keys(fr).sort());
    expect(Object.keys(fe).sort()).toEqual(Object.keys(fr).sort());
  });
  it("have no empty strings", () => {
    for (const [k, v] of Object.entries({ ...fr, ...fk, ...fe })) expect(v.trim(), k).not.toBe("");
  });
  it("use the same placeholders", () => {
    for (const k of Object.keys(fr)) {
      expect(ph(fk[k]), k).toBe(ph(fr[k]));
      expect(ph(fe[k]), k).toBe(ph(fr[k]));
    }
  });
  it("Kazakh strings use Kazakh letters", () => {
    const all = Object.values(fk).join(" ");
    for (const letter of ["ә", "ғ", "қ", "ң", "ө", "ұ", "ү", "і"]) expect(all.includes(letter), letter).toBe(true);
  });
  it("Kazakh UI is actually translated (not copied from Russian)", () => {
    // Identical on purpose: "Бонус" is the same word in Kazakh; the phone mask is not text; a service name is a name;
    // the cart counters are templates of placeholders only.
    const allowed = new Set(["offer.bonus", "checkout.phonePlaceholder", "pharmacy.serviceOsm", "cart.positionsCount", "cart.summary"]);
    const same = Object.keys(fr).filter((k) => fr[k] === fk[k] && fr[k].length > 12 && !allowed.has(k));
    expect(same, same.join(", ")).toEqual([]);
  });
  it("English UI has no Cyrillic text left over", () => {
    const cyrillic = Object.entries(fe).filter(([, v]) => /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүІі]/.test(v));
    expect(cyrillic.map(([k]) => k)).toEqual([]);
  });
});

describe("locale routing", () => {
  it("keeps Russian unprefixed and puts Kazakh and English under their prefix", () => {
    expect(locales).toEqual(["ru", "kk", "en"]);
    expect(localizedPath("ru", "/catalog")).toBe("/catalog");
    expect(localizedPath("kk", "/catalog")).toBe("/kk/catalog");
    expect(localizedPath("en", "/")).toBe("/en");
    expect(localizedPath("en", "/product/x?sku=y")).toBe("/en/product/x?sku=y");
    expect(splitLocale("/en/catalog/item/5")).toEqual({ locale: "en", path: "/catalog/item/5" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/catalog")).toEqual({ locale: "ru", path: "/catalog" });
  });
  it("English shows the original for untranslated data and English names for reference data", () => {
    expect(pickLocalized("en", "Парацетамол 500 мг", "Парацетамол 500 мг (kk)")).toBe("Парацетамол 500 мг");
    expect(pickLocalized("kk", "Адрес", "Мекенжай")).toBe("Мекенжай");
    expect(hasOwnTranslation("en", "мәтін")).toBe(false);
    expect(hasOwnTranslation("kk", "мәтін")).toBe(true);
    expect(categoryName("en", "lekarstvennye-sredstva", "Лекарственные средства")).toBe("Medicines");
    expect(categoryName("en", "unknown-section", "Новый раздел")).toBe("Новый раздел");
    expect(cityName("en", "astana", "Астана")).toBe("Astana");
  });
});
