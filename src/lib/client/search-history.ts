"use client";
// Search history in the visitor's browser (localStorage), like the cart and favourites. Only queries the visitor
// actually submitted are recorded — never typed characters or autocomplete suggestions. Nothing here is sent to the
// server or to third parties. When the browser refuses to store data (private mode, full or blocked storage) the
// history keeps working for the open page and `status` tells the interface to say so.
import { useSyncExternalStore } from "react";
import { addToHistory, parseHistory, type SearchHistoryEntry } from "@/lib/search-history";

export const SEARCH_HISTORY_KEY = "salamat_search_history_v1";

export type SearchHistoryStatus = "ok" | "readFailed" | "saveFailed" | "clearFailed";

export interface SearchHistorySnapshot {
  entries: SearchHistoryEntry[];
  status: SearchHistoryStatus;
}

const SERVER_SNAPSHOT: SearchHistorySnapshot = { entries: [], status: "ok" };

let snapshot: SearchHistorySnapshot | null = null;
const listeners = new Set<() => void>();

function storage(): Storage {
  return window.localStorage; // may throw (blocked cookies / site data)
}

function load(): SearchHistorySnapshot {
  try {
    const raw = storage().getItem(SEARCH_HISTORY_KEY);
    return { entries: raw ? parseHistory(JSON.parse(raw)) : [], status: "ok" };
  } catch (e) {
    // Unreadable JSON is just a broken record: start over. A blocked storage is reported.
    return { entries: [], status: e instanceof SyntaxError ? "ok" : "readFailed" };
  }
}

function read(): SearchHistorySnapshot {
  if (!snapshot) snapshot = load();
  return snapshot;
}

function set(next: SearchHistorySnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab of the same browser changed or cleared the history.
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEARCH_HISTORY_KEY || e.key === null) {
      snapshot = null;
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const searchHistory = {
  /** Current entries (newest first) and whether the browser lets us store them. */
  get: read,
  /** Records a submitted query. Returns false when the browser did not let us store it. */
  record(query: string, at = Date.now()): boolean {
    const entries = addToHistory(read().entries, query, at);
    try {
      storage().setItem(SEARCH_HISTORY_KEY, JSON.stringify(entries));
      set({ entries, status: "ok" });
      return true;
    } catch {
      set({ entries, status: "saveFailed" });
      return false;
    }
  },
  /** Removes the whole history. Returns false when the browser did not let us remove it. */
  clear(): boolean {
    try {
      storage().removeItem(SEARCH_HISTORY_KEY);
      set({ entries: [], status: "ok" });
      return true;
    } catch {
      set({ entries: [], status: "clearFailed" });
      return false;
    }
  },
};

export function useSearchHistory(): SearchHistorySnapshot {
  return useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
}
