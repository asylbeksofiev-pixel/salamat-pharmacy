import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToHistory, cleanQuery, formatHistoryTime, parseHistory, SEARCH_HISTORY_LIMIT, type SearchHistoryEntry } from "@/lib/search-history";

describe("search history rules", () => {
  it("keeps only real queries, trimmed and with single spaces", () => {
    expect(cleanQuery("  парацетамол   500 мг ")).toBe("парацетамол 500 мг");
    expect(addToHistory([], "   ", 1)).toEqual([]);
    expect(cleanQuery("а".repeat(150))).toHaveLength(100);
  });

  it("puts the newest query first and keeps the time of each search", () => {
    let list: SearchHistoryEntry[] = [];
    list = addToHistory(list, "аспирин", 1000);
    list = addToHistory(list, "но-шпа", 2000);
    expect(list).toEqual([
      { q: "но-шпа", at: 2000 },
      { q: "аспирин", at: 1000 },
    ]);
  });

  it("a repeated query moves to the top with the new time instead of making a duplicate", () => {
    let list: SearchHistoryEntry[] = [];
    list = addToHistory(list, "Аспирин", 1000);
    list = addToHistory(list, "но-шпа", 2000);
    list = addToHistory(list, "  аспирин ", 3000);
    expect(list).toEqual([
      { q: "аспирин", at: 3000 },
      { q: "но-шпа", at: 2000 },
    ]);
    // ё and е are the same query
    list = addToHistory(list, "Ёлка", 4000);
    list = addToHistory(list, "елка", 5000);
    expect(list.filter((e) => e.q.toLowerCase().replace("ё", "е") === "елка")).toEqual([{ q: "елка", at: 5000 }]);
  });

  it("keeps at most the announced number of queries, dropping the oldest", () => {
    let list: SearchHistoryEntry[] = [];
    for (let i = 0; i < SEARCH_HISTORY_LIMIT + 5; i++) list = addToHistory(list, `запрос ${i}`, i);
    expect(list).toHaveLength(SEARCH_HISTORY_LIMIT);
    expect(list[0].q).toBe(`запрос ${SEARCH_HISTORY_LIMIT + 4}`);
    expect(list.at(-1)!.q).toBe("запрос 5");
  });

  it("reads stored data defensively", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({ q: "x" })).toEqual([]);
    expect(
      parseHistory([{ q: "аспирин", at: 2 }, { q: "АСПИРИН", at: 1 }, { q: 5, at: 1 }, { q: "  ", at: 1 }, { q: "ok", at: "x" }, null, { q: "но-шпа", at: 0 }]),
    ).toEqual([
      { q: "аспирин", at: 2 },
      { q: "но-шпа", at: 0 },
    ]);
  });

  it("shows the time for today and the date for earlier searches", () => {
    const now = Date.UTC(2026, 10, 20, 12, 0);
    expect(formatHistoryTime(Date.UTC(2026, 10, 20, 9, 5), now, "ru-KZ", "UTC")).toBe("09:05");
    expect(formatHistoryTime(Date.UTC(2026, 2, 3, 9, 5), now, "en", "UTC")).toMatch(/Mar.*3|3.*Mar/);
    expect(formatHistoryTime(Date.UTC(2025, 2, 3, 9, 5), now, "ru-KZ", "UTC")).toBe("03.03.2025");
  });
});

/** Minimal browser for the store: localStorage that can be told to refuse reads or writes. */
function fakeBrowser() {
  const data = new Map<string, string>();
  const flags = { failGet: false, failSet: false, failRemove: false };
  const localStorage = {
    getItem: (k: string) => {
      if (flags.failGet) throw new DOMException("blocked", "SecurityError");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (flags.failSet) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => {
      if (flags.failRemove) throw new DOMException("blocked", "SecurityError");
      data.delete(k);
    },
  };
  vi.stubGlobal("window", { localStorage, addEventListener: () => {}, removeEventListener: () => {} });
  return { data, flags };
}

async function loadStore() {
  vi.resetModules();
  return import("@/lib/client/search-history");
}

describe("search history in the browser", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("survives a reload: what was saved is read back in the same order", async () => {
    const { data } = fakeBrowser();
    const first = await loadStore();
    expect(first.searchHistory.record("аспирин", 1000)).toBe(true);
    expect(first.searchHistory.record("но-шпа", 2000)).toBe(true);
    expect(JSON.parse(data.get(first.SEARCH_HISTORY_KEY)!)).toEqual([
      { q: "но-шпа", at: 2000 },
      { q: "аспирин", at: 1000 },
    ]);
    // "Reload": a fresh module reads the same storage.
    const second = await loadStore();
    expect(second.searchHistory.get()).toEqual({
      entries: [
        { q: "но-шпа", at: 2000 },
        { q: "аспирин", at: 1000 },
      ],
      status: "ok",
    });
    second.searchHistory.record("аспирин", 3000);
    expect(second.searchHistory.get().entries.map((e) => `${e.q}@${e.at}`)).toEqual(["аспирин@3000", "но-шпа@2000"]);
  });

  it("clears the whole history", async () => {
    const { data } = fakeBrowser();
    const store = await loadStore();
    store.searchHistory.record("аспирин", 1);
    expect(store.searchHistory.clear()).toBe(true);
    expect(data.has(store.SEARCH_HISTORY_KEY)).toBe(false);
  });

  it("reports when the browser refuses to save or clear", async () => {
    const { flags } = fakeBrowser();
    const store = await loadStore();
    flags.failSet = true;
    expect(store.searchHistory.record("аспирин", 1)).toBe(false);
    // Still usable on the open page, with a clear status for the interface.
    expect(store.searchHistory.get()).toEqual({ entries: [{ q: "аспирин", at: 1 }], status: "saveFailed" });
    flags.failRemove = true;
    expect(store.searchHistory.clear()).toBe(false);
    expect(store.searchHistory.get()).toEqual({ entries: [], status: "clearFailed" });
  });

  it("does not crash when the storage cannot even be read", async () => {
    const { flags } = fakeBrowser();
    flags.failGet = true;
    flags.failSet = true;
    const store = await loadStore();
    expect(store.searchHistory.get()).toEqual({ entries: [], status: "readFailed" });
    expect(store.searchHistory.record("аспирин", 1)).toBe(false);
  });

  it("starts over when the stored record is broken", async () => {
    const { data } = fakeBrowser();
    data.set("salamat_search_history_v1", "{not json");
    const store = await loadStore();
    expect(store.searchHistory.get()).toEqual({ entries: [], status: "ok" });
  });
});
