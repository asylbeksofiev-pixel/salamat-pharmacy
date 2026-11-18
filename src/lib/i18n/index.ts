import ru, { type Dictionary } from "./ru";
import kk from "./kk";
import en from "./en";
import { type Locale } from "./config";

export * from "./config";
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { ru, kk, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
