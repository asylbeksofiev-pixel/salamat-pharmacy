export const locales = ["ru", "kk", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";
export const LOCALE_COOKIE = "salamat_locale";

/** Short labels for the language switcher. "KZ" is used for Kazakh as requested by the brand. */
export const localeLabels: Record<Locale, string> = { ru: "RU", kk: "KZ", en: "EN" };
export const localeNames: Record<Locale, string> = { ru: "Русский", kk: "Қазақша", en: "English" };
/** BCP-47 tags for <html lang>, hreflang and Intl (numbers, dates). */
export const localeTags: Record<Locale, string> = { ru: "ru-KZ", kk: "kk-KZ", en: "en" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Locales served under a URL prefix (/kk/..., /en/...). Russian stays at the unprefixed URL. */
export const prefixedLocales = locales.filter((l) => l !== defaultLocale);

/**
 * Russian pages live at the unprefixed URL (/catalog), other languages under their prefix
 * (/kk/catalog, /en/catalog). `path` must start with "/" and may carry a query string.
 */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  if (clean === "/") return `/${locale}`;
  if (clean.startsWith("/?")) return `/${locale}${clean.slice(1)}`;
  return `/${locale}${clean}`;
}

/** Strips a locale prefix: "/kk/catalog" -> { locale: "kk", path: "/catalog" }. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first) && first !== defaultLocale) {
    return { locale: first, path: `/${rest.join("/")}`.replace(/\/$/, "") || "/" };
  }
  return { locale: defaultLocale, path: pathname || "/" };
}

/** Replaces {name} placeholders. Unknown placeholders are left visible so they are caught in tests. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/**
 * Content stored in the database (product names, addresses, pages, offers) exists in Russian and sometimes
 * in Kazakh. Kazakh pages get the Kazakh value when there is one; every other case — including English,
 * which has no confirmed translations in the data — shows the original Russian value.
 */
export function pickLocalized(locale: Locale, ruValue: string, kkValue?: string | null): string {
  if (locale === "kk" && kkValue && kkValue.trim()) return kkValue;
  return ruValue;
}

/** Same rule for optional fields (descriptions, terms): Kazakh when present, otherwise the original. */
export function pickLocalizedOptional(locale: Locale, ruValue: string | null, kkValue?: string | null): string | null {
  if (locale === "kk" && kkValue && kkValue.trim()) return kkValue;
  return ruValue;
}

/**
 * `lang` for original-language data shown on an English page (product names, addresses), so screen readers
 * pronounce Cyrillic text in Russian. Undefined when the text matches the page language.
 */
export function dataLang(locale: Locale, text: string | null | undefined): "ru" | undefined {
  return locale === "en" && !!text && /[А-Яа-яЁё]/.test(text) ? "ru" : undefined;
}

/** True when a page in `locale` shows its own translation (not the Russian original). */
export function hasOwnTranslation(locale: Locale, kkValue?: string | null): boolean {
  if (locale === "ru") return true;
  if (locale === "kk") return !!kkValue && !!kkValue.trim();
  return false;
}

/**
 * English names for reference data whose meaning is unambiguous (catalogue sections and city names seeded from
 * the official site). Product names, addresses and legal details are never translated here.
 */
const EN_CATEGORY_NAMES: Record<string, string> = {
  "lekarstvennye-sredstva": "Medicines",
  "vitaminy-i-bady": "Vitamins and supplements",
  "travy-i-sbory": "Herbs and herbal teas",
  "medicinskie-pribory-i-izdeliya": "Medical devices and supplies",
  "pravilnoe-pitanie": "Healthy nutrition",
  "mama-i-malysh": "Mother and baby",
  "lechebnaya-kosmetika": "Therapeutic cosmetics",
  "uhod-za-polostyu-rta": "Oral care",
  gigiena: "Hygiene",
};
const EN_CITY_NAMES: Record<string, string> = {
  astana: "Astana",
  "arshaly-district": "Arshaly District, Akmola Region",
};

export function categoryName(locale: Locale, slug: string, ruValue: string, kkValue?: string | null): string {
  if (locale === "en") return EN_CATEGORY_NAMES[slug] ?? ruValue;
  return pickLocalized(locale, ruValue, kkValue);
}

export function cityName(locale: Locale, slug: string, ruValue: string, kkValue?: string | null): string {
  if (locale === "en") return EN_CITY_NAMES[slug] ?? ruValue;
  return pickLocalized(locale, ruValue, kkValue);
}
