// Search text normalisation shared by indexing (server) and query handling.
export const MAX_QUERY_LENGTH = 100;

/** Lower-case, ё→е, unify decimal comma, strip punctuation, collapse whitespace. */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/№\s*/g, "№")
    .replace(/[^\p{L}\p{N}.№%+\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(query: string): string[] {
  return normalizeSearchText(query)
    .split(" ")
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(token: string): string {
  return token.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const en = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const ruLayout = "йцукенгшщзхъфывапролджэячсмитьбюё";

/** Fixes text typed with the wrong keyboard layout: "gfhfwtnfvjk" -> "парацетамол". */
export function fixKeyboardLayout(input: string): string | null {
  const lower = input.toLowerCase();
  if (!/[a-z]/.test(lower) || /[а-яё]/.test(lower)) return null;
  let out = "";
  for (const ch of lower) {
    const i = en.indexOf(ch);
    out += i >= 0 ? ruLayout[i] : ch;
  }
  return out === lower ? null : out;
}

/** Builds the stored searchText for a variant. */
export function buildSearchText(parts: Array<string | null | undefined | string[]>): string {
  const flat = parts.flatMap((p) => (Array.isArray(p) ? p : [p])).filter((p): p is string => !!p && !!p.trim());
  return normalizeSearchText(Array.from(new Set(flat)).join(" ")).slice(0, 2000);
}
