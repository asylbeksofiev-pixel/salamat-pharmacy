export const locales = ["ru", "kk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ru";
export const LOCALE_COOKIE = "salamat_locale";

/** Short labels for the language switcher. "KZ" is used for Kazakh as requested by the brand. */
export const localeLabels: Record<Locale, string> = { ru: "RU", kk: "KZ" };
export const localeNames: Record<Locale, string> = { ru: "Русский", kk: "Қазақша" };
/** BCP-47 tags for <html lang>, hreflang and Intl. */
export const localeTags: Record<Locale, string> = { ru: "ru-KZ", kk: "kk-KZ" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Russian pages live at the unprefixed URL (/catalog), Kazakh pages under /kk (/kk/catalog).
 * `path` must start with "/".
 */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
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
 * Picks the Kazakh value when it exists and the page is Kazakh, otherwise the Russian one.
 * Used for content that may not have a confirmed translation (addresses, product names, pages).
 */
export function pickLocalized(locale: Locale, ruValue: string, kkValue?: string | null): string {
  if (locale === "kk" && kkValue && kkValue.trim()) return kkValue;
  return ruValue;
}
