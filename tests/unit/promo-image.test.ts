import { describe, expect, it } from "vitest";
import { isPromotionImage } from "@/lib/promo-image";

describe("promotion image source", () => {
  it("accepts files from public/promo and https addresses", () => {
    for (const v of ["/promo/promo-1.jpg", "/promo/Spring_2027.webp", "/promo/a.PNG", "https://cdn.example.kz/p.jpg"]) expect(isPromotionImage(v), v).toBe(true);
  });
  it("rejects other paths, http, traversal and data URLs", () => {
    for (const v of ["/brand/logo.png", "/promo/../.env", "/promo/x.svg", "http://example.kz/p.jpg", "data:image/png;base64,AAA", "javascript:alert(1)", "promo-1.jpg"]) expect(isPromotionImage(v), v).toBe(false);
  });
});
