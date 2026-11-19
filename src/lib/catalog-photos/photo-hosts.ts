// Product photos published as direct links to the Open Facts image servers (CC BY-SA 3.0):
// https://images.open{food,beauty,products}facts.org/images/products/<barcode path>/<file>.jpg
// The same rule is allowed for next/image in next.config.ts (images.remotePatterns), so the large originals
// (median ≈ 3 800 px, 600 KB) are resized and cached by the site instead of being loaded as they are.

const OPEN_FACTS_IMAGE_HOST = /^images\.open(food|beauty|products)facts\.org$/;

export const OPEN_FACTS_IMAGE_HOSTS = ["images.openfoodfacts.org", "images.openbeautyfacts.org", "images.openproductsfacts.org"] as const;

export function isOpenFactsPhotoUrl(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && OPEN_FACTS_IMAGE_HOST.test(u.hostname) && !u.port && u.pathname.startsWith("/images/products/") && !u.search;
  } catch {
    return false;
  }
}
