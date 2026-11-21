"use client";
// Search history of this browser only (localStorage, key salamat_search_history_v1). Saved: queries the visitor
// submitted from the header, the home page or the catalogue — not every typed character. Never sent to the server,
// analytics or third parties. A repeated query moves to the top (spaces and letter case do not make a new entry).
// Damaged or unavailable storage gives an empty history and never breaks the page.
import { useSyncExternalStore } from "react";
import { createStore } from "./stores";

export const HISTORY_KEY = "salamat_search_history_v1";
/** Entries kept; the drop-down shows the first HISTORY_SHOWN and the rest on request. */
export const HISTORY_MAX = 20;
export const HISTORY_SHOWN = 5;
const MAX_LENGTH = 100;

/** Display form: trimmed, inner spaces collapsed, at most 100 characters. */
export function cleanQuery(q: string): string {
  return q.replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
}

/** Identity of a query: case, ё/е and extra spaces do not matter. */
export function queryKey(q: string): string {
  return cleanQuery(q).toLowerCase().replace(/ё/g, "е");
}

/** Validates stored data: a list of non-empty strings, duplicates removed, at most HISTORY_MAX. */
export function parseHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const q = cleanQuery(v);
    const k = queryKey(q);
    if (q.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
    if (out.length >= HISTORY_MAX) break;
  }
  return out;
}

/** New list with `q` on top (an equal entry is moved, not duplicated). Pure. */
export function withQuery(list: string[], q: string): string[] {
  const clean = cleanQuery(q);
  if (clean.length < 2) return list;
  const k = queryKey(clean);
  return [clean, ...list.filter((x) => queryKey(x) !== k)].slice(0, HISTORY_MAX);
}

const EMPTY: string[] = [];
const store = createStore<string[]>(HISTORY_KEY, parseHistory, EMPTY);

export const searchHistory = {
  add(q: string) {
    const next = withQuery(store.read(), q);
    if (next !== store.read()) store.write(next);
  },
  remove(q: string) {
    const k = queryKey(q);
    store.write(store.read().filter((x) => queryKey(x) !== k));
  },
  clear() {
    store.write([]);
  },
};

/** The history; empty on the server and during hydration (no mismatch), then the browser's list. */
export function useSearchHistory(): string[] {
  return useSyncExternalStore(store.subscribe, store.read, () => EMPTY);
}
