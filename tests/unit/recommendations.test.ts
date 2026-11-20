import { describe, expect, it } from "vitest";
import { similarityKey } from "@/server/recommendations";

describe("similar products key", () => {
  it("is the leading word of the name (the active substance or product line)", () => {
    expect(similarityKey("Парацетамол 500 мг №20 табл.")).toBe("парацетамол");
    expect(similarityKey("ПАРАЦЕТАМОЛ 200 мг №10 табл.")).toBe("парацетамол");
    expect(similarityKey("Ёлочный экстракт для ванн")).toBe("елочный");
    expect(similarityKey("Aspirin Cardio 100 mg")).toBe("aspirin");
  });
  it("is empty for numbers, short or generic words (no invented links)", () => {
    expect(similarityKey("5-НОК 50 мг")).toBeNull();
    expect(similarityKey("Йод 5%")).toBeNull();
    expect(similarityKey("Набор первой помощи")).toBeNull();
    expect(similarityKey("Тестовый товар 001")).toBeNull();
    expect(similarityKey("")).toBeNull();
  });
});
