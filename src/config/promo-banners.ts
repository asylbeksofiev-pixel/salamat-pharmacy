// Banners of the "Offers and discounts" carousel on the home page.
//
// HOW TO ADD A BANNER (see docs/promo-banners.md):
//   1. Put the image into  public/promo/  — promo-3.jpg, 1920 × 1080 px (16 : 9), JPG/PNG/WebP.
//      The frame is 16 : 9 on phones and tablets and 2 : 1 on wide screens (from 1024 px), so about 5 % of the
//      height is trimmed at the top and bottom there: keep important text and objects away from those edges.
//      Optionally a separate phone version (`mobile`), also 16 : 9.
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
  /** Banner image, 16 : 9 (1920 × 1080 px recommended). */
  desktop: BannerSrc;
  /** Phone version, 16 : 9; usually the same file as `desktop`. */
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
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 1920, height: 1080 },
} as const;

export const PROMO_BANNERS: PromoBanner[] = [
  {
    id: "promo-1",
    desktop: "/promo/promo-1.jpg",
    mobile: "/promo/promo-1.jpg",
    alt: {
      ru: "Аптеки SALAMAT на карте Астаны и аптечные товары",
      kk: "Астана картасындағы SALAMAT дәріханалары және дәріхана тауарлары",
      en: "SALAMAT pharmacies on the map of Astana and pharmacy products",
    },
    href: "/pharmacies",
  },
  {
    id: "promo-2",
    desktop: "/promo/promo-2.jpg",
    mobile: "/promo/promo-2.jpg",
    alt: {
      ru: "Зелёная карта с аптечным крестом, монеты и подарок",
      kk: "Дәріхана кресі бар жасыл карта, тиындар және сыйлық",
      en: "A green card with a pharmacy cross, coins and a gift",
    },
    href: "/promotions",
  },
  // Next banner — uncomment and fill in when the file is in public/promo/:
  // {
  //   id: "promo-3",
  //   desktop: "/promo/promo-3.jpg",
  //   mobile: "/promo/promo-3.jpg",
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
