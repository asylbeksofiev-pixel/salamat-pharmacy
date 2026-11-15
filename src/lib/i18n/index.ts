import ru, { type Dictionary } from "./ru";
import kk from "./kk";
import { type Locale } from "./config";

export * from "./config";
export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { ru, kk };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
