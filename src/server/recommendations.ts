import "server-only";
// Recommendations for a catalogue product page, from real catalogue data only (no invented links, no claims about
// using products together or replacing one medicine with another):
//   • similar — products of the same published section that share features read literally from the names:
//       – medicines, vitamins and herbs: the same name (leading word), i.e. other forms, strengths or makers of the
//         same product; the page says plainly that this is not a substitution advice;
//       – other sections: the same product type ("micellar water", "nappies"), the same brand and brand line first;
//         without a known type — other products of the same brand;
//   • others — other products of the same section in a stable, varied order (the page calls them "Other products
//     in the section": there is no data for real "recommended" links).
// Every list comes from bounded queries (never the whole catalogue). The current product, hidden products, repeated
// names and products already shown in the first list are left out. Any error gives empty lists: the page still works.
import { descendantIds, getCategoryTree } from "./catalog";
import { listCatalogCandidates, type CatalogItem } from "./catalog-items";
import { normalizeProductName, productFeatures, typeFragments, type ProductFeatures } from "@/lib/product-features";
import type { Locale } from "@/lib/i18n";

export const RECOMMENDATION_LIMIT = 12;
/** Sections where "similar" means "the same product name" only (medicines are never offered as alternatives). */
const NAME_ONLY_SECTIONS = new Set(["lekarstvennye-sredstva", "vitaminy-i-bady", "travy-i-sbory"]);
const CANDIDATES = 240;
const SET = /(?<![\p{L}])(?:набор|комплект)(?![\p{L}])|\d\s?\+\s?\d(?!\d)|\+\s?(?:косметичка|шопер)/iu;

/** Generic leading words that say nothing about what the product is. */
const GENERIC = new Set(["набор", "комплект", "средство", "товар", "тестовый", "test", "set", "new"]);

/** The leading word of a product name: letters only, at least 4 of them. */
export function similarityKey(name: string): string | null {
  const first = name
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[\s,.;:()«»"'/+-]+/)
    .find(Boolean);
  if (!first || !/^\p{L}{4,}$/u.test(first) || GENERIC.has(first)) return null;
  return first;
}

export type SimilarBasis = "name" | "type" | "brand";

export interface Scored {
  item: CatalogItem;
  score: number;
}

/**
 * Scores candidates against the current product; null = not similar. Pure function (unit-tested).
 * `nameOnly`: only the same leading word counts (medicines), ranked by the same form.
 */
export function similarityScore(current: ProductFeatures, candidate: ProductFeatures, nameOnly: boolean): number | null {
  if (nameOnly) {
    if (!current.key || candidate.key !== current.key) return null;
    return 10 + (current.form && candidate.form === current.form ? 2 : 0) + (current.line && candidate.line === current.line ? 1 : 0);
  }
  const sameBrand = !!current.key && candidate.key === current.key;
  const sameLine = sameBrand && !!current.line && candidate.line === current.line;
  if (current.type) {
    if (candidate.type !== current.type) return null;
    return 4 + (sameBrand ? 2 : 0) + (sameLine ? 2 : 0) + (current.form && candidate.form === current.form ? 1 : 0);
  }
  if (!sameBrand) return null;
  return 2 + (sameLine ? 2 : 0);
}

/** Highest score first, then name and id: a stable order. Same names (other ids) appear once; at most 3 sizes of one product. */
export function pickSimilar(current: CatalogItem, candidates: CatalogItem[], nameOnly: boolean, limit = RECOMMENDATION_LIMIT): CatalogItem[] {
  const f = productFeatures(current.name);
  const ownName = normalizeProductName(current.name).trim();
  const scored: Scored[] = [];
  const currentIsSet = SET.test(current.name);
  for (const c of candidates) {
    if (c.id === current.id) continue;
    const s = similarityScore(f, productFeatures(c.name), nameOnly);
    // Gift sets and "1+1" packs come after single products (unless the current product is a set itself).
    if (s !== null) scored.push({ item: c, score: s - (!currentIsSet && SET.test(c.name) ? 3 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "ru") || Number(a.item.id) - Number(b.item.id));
  const names = new Set([ownName]);
  const perBase = new Map<string, number>();
  const out: CatalogItem[] = [];
  for (const { item } of scored) {
    const name = normalizeProductName(item.name).trim();
    const base = productFeatures(item.name).base;
    if (names.has(name) || (perBase.get(base) ?? 0) >= 3) continue;
    names.add(name);
    perBase.set(base, (perBase.get(base) ?? 0) + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Varied "other products": one size per product, at most two per brand, in the given (stable) order. */
export function pickVaried(candidates: CatalogItem[], exclude: Set<string>, limit = RECOMMENDATION_LIMIT, shownBases: string[] = []): CatalogItem[] {
  const bases = new Set<string>(shownBases);
  const brands = new Map<string, number>();
  const out: CatalogItem[] = [];
  for (const c of candidates) {
    if (exclude.has(c.id)) continue;
    const f = productFeatures(c.name);
    if (bases.has(f.base) || (f.key && (brands.get(f.key) ?? 0) >= 2)) continue;
    bases.add(f.base);
    if (f.key) brands.set(f.key, (brands.get(f.key) ?? 0) + 1);
    exclude.add(c.id);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export interface Recommendations {
  similar: CatalogItem[];
  /** What the similar products share (shown under the heading). */
  basis: SimilarBasis | null;
  others: CatalogItem[];
}

export async function productRecommendations(item: CatalogItem, locale: Locale): Promise<Recommendations> {
  const empty: Recommendations = { similar: [], basis: null, others: [] };
  // A product without a published section (waiting for review): only products with the same name, from the whole
  // public catalogue; no "other products of the section".
  if (!item.categorySlug) {
    const f = productFeatures(item.name);
    if (!f.key) return empty;
    try {
      const candidates = await listCatalogCandidates({ categoryIds: null, nameLike: [f.key], excludeIds: [item.id], limit: CANDIDATES, locale });
      const similar = pickSimilar(item, candidates, true);
      return { similar, basis: similar.length ? "name" : null, others: [] };
    } catch (e) {
      console.error("similar products failed", (e as Error).message.slice(0, 200));
      return empty;
    }
  }
  let categoryIds: string[] = [];
  try {
    const node = (await getCategoryTree(locale)).bySlug.get(item.categorySlug);
    if (!node) return empty;
    categoryIds = descendantIds(node);
  } catch (e) {
    console.error("recommendations: sections failed", (e as Error).message.slice(0, 200));
    return empty;
  }
  const f = productFeatures(item.name);
  const nameOnly = NAME_ONLY_SECTIONS.has(item.categorySlug);
  const basis: SimilarBasis | null = nameOnly ? (f.key ? "name" : null) : f.type ? "type" : f.key ? "brand" : null;

  let similar: CatalogItem[] = [];
  try {
    if (basis) {
      const like = basis === "type" ? [...typeFragments(f.type), ...(f.key ? [f.key] : [])] : [f.key!];
      const candidates = await listCatalogCandidates({ categoryIds, nameLike: like, excludeIds: [item.id], limit: CANDIDATES, locale });
      similar = pickSimilar(item, candidates, nameOnly);
    }
  } catch (e) {
    console.error("similar products failed", (e as Error).message.slice(0, 200));
  }
  let others: CatalogItem[] = [];
  try {
    const exclude = new Set([item.id, ...similar.map((s) => s.id)]);
    const candidates = await listCatalogCandidates({ categoryIds, excludeIds: [...exclude], limit: 80, seed: item.id, locale });
    // Repeated names (the same product under another id) are not shown twice.
    const shown = new Set([item, ...similar].map((x) => normalizeProductName(x.name).trim()));
    others = pickVaried(
      candidates.filter((c) => !shown.has(normalizeProductName(c.name).trim())),
      exclude,
      RECOMMENDATION_LIMIT,
      [f.base],
    );
  } catch (e) {
    console.error("section products failed", (e as Error).message.slice(0, 200));
  }
  return { similar, basis: similar.length ? basis : null, others };
}
