import { describe, expect, it } from "vitest";
import { buildVocabulary, correctWord, editDistance, suggestCorrection } from "@/lib/search-suggest";
import { fixKeyboardLayoutToLatin } from "@/lib/search-normalize";

const vocab = buildVocabulary([
  ["парацетамол", 13],
  ["таблетки", 900],
  ["бинт", 107],
  ["bioderma", 116],
  ["биодерма", 116],
  ["мицеллярная", 40],
  ["вода", 300],
  ["ибупрофен", 20],
]);

describe("search typo suggestions", () => {
  it("measures edits with adjacent swaps and stops early", () => {
    expect(editDistance("парацетомол", "парацетамол", 2)).toBe(1);
    expect(editDistance("ибупорфен", "ибупрофен", 2)).toBe(1); // swap
    expect(editDistance("абв", "вгдежз", 1)).toBe(2); // > max
  });

  it("offers the real word for a typo, a partly typed word and the wrong keyboard layout", () => {
    expect(correctWord("парацетомол", vocab)).toBe("парацетамол");
    expect(correctWord("парацетом", vocab)).toBe("парацетамол");
    expect(correctWord("ишщвукьф", vocab)).toBe("bioderma");
    expect(fixKeyboardLayoutToLatin("ишщвукьф")).toBe("bioderma");
  });

  it("leaves words that already occur, short words and words with digits alone", () => {
    expect(correctWord("бинт", vocab)).toBeNull();
    expect(correctWord("парац", vocab)).toBeNull(); // part of a real word: the search finds it
    expect(correctWord("бнт", vocab)).toBeNull(); // too short to guess
    expect(suggestCorrection(["4870004336100"], vocab)).toBeNull(); // an article is never "corrected"
    expect(suggestCorrection(["парацетомол", "500"], vocab)).toBe("парацетамол 500");
    expect(suggestCorrection(["мицелярная", "вода"], vocab)).toBe("мицеллярная вода");
    expect(suggestCorrection(["вода"], vocab)).toBeNull();
  });

  it("returns nothing when no word is close enough (no random suggestions)", () => {
    expect(correctWord("автомобиль", vocab)).toBeNull();
  });
});
