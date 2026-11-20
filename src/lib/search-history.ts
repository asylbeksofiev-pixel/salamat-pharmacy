// Search history rules (pure functions, shared by the browser store and the tests).
// The history belongs to the visitor: it lives only in their browser (src/lib/client/search-history.ts) and is never
// sent to the server or to third parties.

export interface SearchHistoryEntry {
  /** The query as the visitor submitted it (trimmed, inner spaces collapsed). */
  q: string;
  /** When it was last searched (ms since epoch). */
  at: number;
}

/** Same limit as the search field (maxLength) and the /search page. */
export const SEARCH_QUERY_MAX = 100;
/** Cap on stored queries. The interface states it, so nothing disappears unannounced. */
export const SEARCH_HISTORY_LIMIT = 50;

export function cleanQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX).trim();
}

/** Two queries are "the same" regardless of case, extra spaces and ё/е. */
export function queryKey(raw: string): string {
  return cleanQuery(raw).toLocaleLowerCase("ru").replace(/ё/g, "е");
}

/**
 * Adds a submitted query on top (newest first). Searching the same query again does not create a duplicate:
 * the old entry moves to the top with the new time and the spelling the visitor used this time.
 */
export function addToHistory(list: readonly SearchHistoryEntry[], raw: string, at: number): SearchHistoryEntry[] {
  const q = cleanQuery(raw);
  if (!q) return [...list];
  const key = queryKey(q);
  return [{ q, at }, ...list.filter((e) => queryKey(e.q) !== key)].slice(0, SEARCH_HISTORY_LIMIT);
}

/** Validates what was read from storage: drops broken records and duplicates, keeps the stored order. */
export function parseHistory(value: unknown): SearchHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SearchHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { q, at } = item as { q?: unknown; at?: unknown };
    if (typeof q !== "string" || typeof at !== "number" || !Number.isFinite(at)) continue;
    const clean = cleanQuery(q);
    const key = queryKey(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push({ q: clean, at });
    if (out.length === SEARCH_HISTORY_LIMIT) break;
  }
  return out;
}

/** "14:05" for today, "12 нояб., 14:05" this year, "12.11.2025" before that — in the visitor's own time zone. */
export function formatHistoryTime(at: number, now: number, localeTag: string, timeZone?: string): string {
  const d = new Date(at);
  const dayOf = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const yearOf = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(x);
  const n = new Date(now);
  if (dayOf(d) === dayOf(n)) return new Intl.DateTimeFormat(localeTag, { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);
  if (yearOf(d) === yearOf(n)) return new Intl.DateTimeFormat(localeTag, { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  return new Intl.DateTimeFormat(localeTag, { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
