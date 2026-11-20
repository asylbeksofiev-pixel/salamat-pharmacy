// Banners of the "Offers and discounts" carousel on the home page.
//
// HOW TO ADD A BANNER (see docs/promo-banners.md):
//   1. Put two images into  public/promo/
//        promo-1-desktop.webp  — 1920 × 640 px (3 : 1), shown on screens from 768 px wide;
//        promo-1-mobile.webp   — 1080 × 810 px (4 : 3), shown on phones.
//      JPG or PNG work too (then change the extension below). Keep important text away from the edges.
//   2. Add an entry to PROMO_BANNERS below (copy the example), set `alt` in three languages — it must repeat the
//      text that is written on the image — and, if the banner should lead somewhere, `href`.
//   3. Commit and push: the banner appears after the next deployment. `npm test` checks that every file exists.
//
// While the list is empty the home page shows a neutral placeholder (no invented offers, prices or dates).
// Only publish offers that SALAMAT has confirmed: terms and dates belong on the banner or the linked page.
import type { Locale } from "@/lib/i18n/config";

/** A path under /public, the same for all languages or one per language (e.g. text on the image). */
export type BannerSrc = string | Record<Locale, string>;

export interface PromoBanner {
  /** Unique, stable id (latin letters, digits, dashes). */
  id: string;
  /** Wide image for tablets and desktops, 1920 × 640 px. */
  desktop: BannerSrc;
  /** Image for phones, 1080 × 810 px. */
  mobile: BannerSrc;
  /** Text alternative in every language: what the banner says (required for accessibility). */
  alt: Record<Locale, string>;
  /**
   * Where the banner leads, e.g. "/promotions/spring-vitamins" (a site path, the language prefix is added
   * automatically) or a full https:// address. Leave out for a banner without a link.
   */
  href?: string;
}

/** Image sizes the banners are prepared for (used for layout and image optimisation). */
export const PROMO_BANNER_SIZE = {
  desktop: { width: 1920, height: 640 },
  mobile: { width: 1080, height: 810 },
} as const;

export const PROMO_BANNERS: PromoBanner[] = [
  // Example — uncomment and fill in when the real banner files are in public/promo/:
  // {
  //   id: "promo-1",
  //   desktop: "/promo/promo-1-desktop.webp",
  //   mobile: "/promo/promo-1-mobile.webp",
  //   alt: {
  //     ru: "Текст, написанный на баннере",
  //     kk: "Баннерде жазылған мәтін",
  //     en: "The text written on the banner",
  //   },
  //   href: "/promotions",
  // },
];

export function bannerSrc(src: BannerSrc, locale: Locale): string {
  return typeof src === "string" ? src : src[locale];
}
