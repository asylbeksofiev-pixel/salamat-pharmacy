import { describe, expect, it } from "vitest";
import { HISTORY_MAX, cleanQuery, parseHistory, queryKey, withQuery } from "@/lib/client/search-history";

describe("search history", () => {
  it("moves a repeated query to the top without duplicates (case, ё and spaces do not matter)", () => {
    let list = withQuery([], "бинт");
    list = withQuery(list, "Парацетамол");
    list = withQuery(list, "  БИНТ  ");
    expect(list).toEqual(["БИНТ", "Парацетамол"]);
    expect(queryKey("Ёлочный   экстракт")).toBe(queryKey("елочный экстракт"));
    expect(cleanQuery("  бинт   стерильный ")).toBe("бинт стерильный");
  });

  it("ignores one-letter queries and keeps at most HISTORY_MAX entries", () => {
    expect(withQuery([], " а ")).toEqual([]);
    let list: string[] = [];
    for (let i = 0; i < HISTORY_MAX + 5; i++) list = withQuery(list, `запрос ${i}`);
    expect(list).toHaveLength(HISTORY_MAX);
    expect(list[0]).toBe(`запрос ${HISTORY_MAX + 4}`);
  });

  it("survives damaged stored data", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({ q: "бинт" })).toEqual([]);
    expect(parseHistory(["бинт", 5, null, "", "БИНТ", "x".repeat(500)])).toEqual(["бинт", "x".repeat(100)]);
  });
});
