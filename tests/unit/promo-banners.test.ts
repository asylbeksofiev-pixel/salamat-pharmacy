import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bannerSrc, PROMO_BANNERS } from "@/config/promo-banners";
import { locales } from "@/lib/i18n/config";

// The home page carousel reads src/config/promo-banners.ts. A typo in a file name would show a broken image,
// so every configured banner must exist in public/ and have a text alternative in every language.
describe("promotion banners config", () => {
  it("has unique ids", () => {
    const ids = PROMO_BANNERS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("points to existing image files in public/", () => {
    for (const b of PROMO_BANNERS) {
      for (const locale of locales) {
        for (const src of [bannerSrc(b.desktop, locale), bannerSrc(b.mobile, locale)]) {
          expect(src, b.id).toMatch(/^\/promo\/[\w.-]+\.(webp|jpe?g|png|avif)$/i);
          expect(existsSync(path.join(process.cwd(), "public", src)), `${b.id}: public${src}`).toBe(true);
        }
      }
    }
  });

  it("has alt text in Russian, Kazakh and English and safe links", () => {
    for (const b of PROMO_BANNERS) {
      for (const locale of locales) expect(b.alt[locale]?.trim(), `${b.id}.alt.${locale}`).toBeTruthy();
      if (b.href) expect(b.href, b.id).toMatch(/^(\/(?!\/)|https:\/\/)/);
    }
  });
});
