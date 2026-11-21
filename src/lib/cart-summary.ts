// "1 позиция · 2 шт." — positions (different products) and units (all quantities) of the cart, worded the same in the
// header, the mobile navigation and the cart page.
import { fmt } from "./i18n/config";
import { pluralWord } from "./format";
import type { Dictionary, Locale } from "./i18n";

export function cartSummary(t: Dictionary, locale: Locale, totals: { positions: number; units: number }): string {
  return fmt(t.cart.summary, {
    positions: fmt(t.cart.positionsCount, { count: totals.positions, word: pluralWord(totals.positions, t.cart.positionsWords, locale) }),
    units: fmt(t.cart.unitsCount, { count: totals.units }),
  });
}
