import { describe, expect, it } from "vitest";
import { buildSearchText, escapeLike, fixKeyboardLayout, normalizeSearchText, tokenize } from "@/lib/search-normalize";
import { slugify } from "@/lib/slug";

describe("search normalisation", () => {
  it("is case-insensitive and unifies ё and decimal commas", () => {
    expect(normalizeSearchText("ПАРАЦЕТАМОЛ Ёж 0,9%")).toBe("парацетамол еж 0.9%");
  });
  it("keeps dosages and pack numbers distinguishable", () => {
    expect(tokenize("Парацетамол 500 мг №20")).toEqual(["парацетамол", "500", "мг", "№20"]);
  });
  it("neutralises SQL LIKE wildcards and special characters", () => {
    expect(escapeLike("50%_x\\")).toBe("50\\%\\_x\\\\");
    expect(tokenize("'; DROP TABLE \"Product\"; --")).toEqual(["drop", "table", "product"]);
  });
  it("limits tokens for very long queries", () => {
    expect(tokenize("а ".repeat(100)).length).toBeLessThanOrEqual(8);
  });
  it("fixes text typed with the wrong keyboard layout", () => {
    expect(fixKeyboardLayout("gfhfwtnfvjk")).toBe("парацетамол");
    expect(fixKeyboardLayout("парацетамол")).toBeNull();
  });
  it("builds a de-duplicated search text including aliases and Kazakh names", () => {
    const t = buildSearchText(["Парацетамол", "Парацетамол 500 мг №20 табл.", ["paracetamol"], null, "Парацетамол"]);
    expect(t).toContain("paracetamol");
    expect(t.match(/парацетамол /g)?.length).toBe(2);
  });
  it("transliterates Russian and Kazakh letters in slugs", () => {
    expect(slugify("Мәңгілік Ел, 59")).toBe("mangilik-el-59");
    expect(slugify("Ибупрофен 400 мг №20 табл.")).toBe("ibuprofen-400-mg-20-tabl");
  });
});
