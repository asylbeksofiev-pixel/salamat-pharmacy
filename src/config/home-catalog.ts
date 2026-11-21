// Home page "Catalogue" selection (src/server/home-catalog.ts).
//
// By default the site picks the products itself: public products with a published section and a photo, spread
// across sections (round-robin in the order below), at most one product per brand and one size of the same product,
// in a stable order. It is not a "bestsellers" or "popular" list — there is no such data.
//
// HOW TO CONTROL IT BY HAND: put product ids (the number in /catalog/item/<id>) into `pinned` — they are shown first,
// in this order, if they are public; the rest is filled automatically. `excluded` ids are never shown on the home page.
// Change `seed` to reshuffle the automatic part. Commit and push: the change appears with the next deployment.
import type { CategorySlug } from "@/lib/catalog-classify";

export interface HomeCatalogConfig {
  /** Shown first, in this order (hidden or unknown ids are skipped). */
  pinned: string[];
  /** Never shown on the home page. */
  excluded: string[];
  /** Order in which sections take turns; sections not listed follow in their usual order. */
  sectionOrder: CategorySlug[];
  /** How many products the carousel shows (max 24). */
  size: number;
  /** Any text; changing it changes the automatic order. */
  seed: string;
}

export const HOME_CATALOG: HomeCatalogConfig = {
  pinned: [],
  excluded: [],
  sectionOrder: [
    "lechebnaya-kosmetika",
    "mama-i-malysh",
    "vitaminy-i-bady",
    "medicinskie-pribory-i-izdeliya",
    "uhod-za-polostyu-rta",
    "gigiena",
    "lekarstvennye-sredstva",
    "pravilnoe-pitanie",
    "travy-i-sbory",
  ],
  size: 12,
  seed: "home-2026-11",
};
