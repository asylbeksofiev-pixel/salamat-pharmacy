import { localeTags, type Locale } from "./i18n/config";

/** Astana switched to UTC+5 in 2024; Asia/Almaty carries that offset in current tz data. */
export const SHOP_TIME_ZONE = process.env.NEXT_PUBLIC_SHOP_TIME_ZONE || "Asia/Almaty";

/** "12 500 ₸". Never call with null: missing prices are rendered as text, not as 0. */
export function formatKzt(amount: number, locale: Locale = "ru"): string {
  const n = new Intl.NumberFormat(localeTags[locale], { maximumFractionDigits: 0 }).format(amount);
  return `${n.replace(/ | /g, " ")} ₸`;
}

export function formatDateTime(value: Date | string, locale: Locale = "ru"): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeTags[locale], {
    timeZone: SHOP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDate(value: Date | string, locale: Locale = "ru"): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeTags[locale], {
    timeZone: SHOP_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "+77016727627" -> "8 (701) 672 76 27" — the format used on the official site. */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const d = digits.slice(1);
    return `8 (${d.slice(0, 3)}) ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
  }
  return e164;
}

export function telHref(e164: string): string {
  return `tel:${e164.replace(/[^\d+]/g, "")}`;
}

/**
 * Picks the plural form for `n` from "форма1|форма2|форма3" (Russian: one|few|many), "item|items" (English: one|other)
 * or a single form (Kazakh nouns do not change after numbers).
 */
export function pluralWord(n: number, forms: string, locale: Locale): string {
  const list = forms.split("|");
  if (list.length === 1) return list[0];
  const cat = new Intl.PluralRules(localeTags[locale]).select(n);
  if (list.length === 2) return cat === "one" ? list[0] : list[1];
  return cat === "one" ? list[0] : cat === "few" ? list[1] : list[2];
}
