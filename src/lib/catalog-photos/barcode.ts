// Barcode checks for public.pharmacy_products.article. The column is not unique and is not always a barcode,
// so a barcode lookup is made only for values that are valid, globally unique GTINs.

export type ArticleKind =
  | "gtin" // EAN-13 / UPC-A / EAN-8 / GTIN-14 with a valid check digit and a global prefix
  | "instore" // GS1 restricted-circulation number (EAN-13 starting with 02 or 20–29): unique only inside one shop
  | "bad_check_digit"
  | "not_numeric"
  | "wrong_length"
  | "empty";

export interface ArticleCheck {
  kind: ArticleKind;
  /** GTIN-14 (zero-padded) when kind = "gtin"; otherwise null. */
  gtin14: string | null;
  /** The article as it appears in the table, trimmed. */
  raw: string;
}

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** GS1 check digit for the leading digits of a GTIN (any length). */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  // Weights 3,1,3,1… from the rightmost digit of the body.
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(body[i]) * w;
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length)) return false;
  return gs1CheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** GS1 restricted-circulation (in-store) numbers: GTIN-13 prefixes 020–029, 040–049, 200–299. */
function isRestricted(gtin13: string): boolean {
  return /^(0[24]|2\d)/.test(gtin13);
}

export function classifyArticle(article: string | null | undefined): ArticleCheck {
  const raw = (article ?? "").trim();
  if (!raw) return { kind: "empty", gtin14: null, raw };
  if (!/^\d+$/.test(raw)) return { kind: "not_numeric", gtin14: null, raw };
  if (!GTIN_LENGTHS.has(raw.length)) return { kind: "wrong_length", gtin14: null, raw };
  if (!isValidGtin(raw)) return { kind: "bad_check_digit", gtin14: null, raw };
  const gtin14 = raw.padStart(14, "0");
  // EAN-8 has its own restricted ranges (prefixes 0 and 2); UPC-A 2… and 4… become 02…/04… once padded.
  if (raw.length === 8 ? /^[02]/.test(raw) : isRestricted(gtin14.slice(1))) return { kind: "instore", gtin14: null, raw };
  return { kind: "gtin", gtin14, raw };
}

/** Forms of the same GTIN as different sources store it (EAN-13 without padding, UPC-A, GTIN-14). */
export function gtinVariants(gtin14: string): string[] {
  const out = new Set<string>([gtin14]);
  const noZeros = gtin14.replace(/^0+/, "");
  if (noZeros.length <= 13) out.add(noZeros.padStart(13, "0"));
  if (noZeros.length <= 12) out.add(noZeros.padStart(12, "0"));
  if (noZeros.length <= 8) out.add(noZeros.padStart(8, "0"));
  return [...out];
}

/** True when two codes denote the same GTIN regardless of zero padding. */
export function sameGtin(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !/^\d+$/.test(a) || !/^\d+$/.test(b)) return false;
  return a.padStart(14, "0") === b.padStart(14, "0");
}
