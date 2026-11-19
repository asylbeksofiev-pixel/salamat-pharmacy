// One validator for catalogue URL parameters, shared by the catalogue, category and search pages and by
// /api/catalog/items. Invalid values are dropped (never a server error); the state lives in the URL so a filtered
// listing survives reloads, can be shared, and works with Back/Forward.
//
//   q          search text (≤ 100 chars)
//   category   section slug; repeat or comma-separate for several (OR between them)
//   priceMin   price from, whole tenge;  priceMax   price to (swapped when given in the wrong order)
//   hasPrice   1 = only products with a price;  hasPhoto  1 = only products with a photo
//   sort       relevance | popular | price_asc | price_desc | name_asc | name_desc
//   page       1…10000

export const CATALOG_SORTS = ["relevance", "popular", "price_asc", "price_desc", "name_asc", "name_desc"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const MAX_QUERY_LENGTH = 100;
export const MAX_PRICE = 100_000_000;
export const MAX_PAGE = 10_000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export interface CatalogQuery {
  q: string;
  /** Section slugs as requested (validated against known sections when `known` is given). */
  categories: string[];
  priceMin?: number;
  priceMax?: number;
  hasPrice: boolean;
  hasPhoto: boolean;
  /** Requested sort, or null for the default. */
  sort: CatalogSort | null;
  page: number;
}

type Input = URLSearchParams | Record<string, string | string[] | undefined>;

function all(input: Input, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const v = input[key];
  return Array.isArray(v) ? v : v === undefined ? [] : [v];
}
const first = (input: Input, key: string) => all(input, key)[0];

function price(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = v.replace(/\s/g, "");
  if (!/^\d{1,9}$/.test(s)) return undefined;
  const n = Number(s);
  return n <= MAX_PRICE ? n : undefined;
}

export function parseCatalogQuery(input: Input, opts: { known?: ReadonlySet<string> } = {}): CatalogQuery {
  const q = (first(input, "q") ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
  const categories = Array.from(
    new Set(
      all(input, "category")
        .flatMap((v) => v.split(","))
        .map((s) => s.trim().toLowerCase())
        .filter((s) => SLUG.test(s) && (!opts.known || opts.known.has(s))),
    ),
  ).slice(0, 20);
  let priceMin = price(first(input, "priceMin"));
  let priceMax = price(first(input, "priceMax"));
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin];
  const sortRaw = first(input, "sort");
  const sort = sortRaw && (CATALOG_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as CatalogSort) : null;
  const pageRaw = first(input, "page");
  const page = pageRaw && /^\d{1,5}$/.test(pageRaw) ? Math.min(MAX_PAGE, Math.max(1, Number(pageRaw))) : 1;
  return { q, categories, priceMin, priceMax, hasPrice: first(input, "hasPrice") === "1", hasPhoto: first(input, "hasPhoto") === "1", sort, page };
}

export interface SortAvailability {
  prices: boolean;
  popularity: boolean;
}

/** The sort actually used: unavailable or meaningless choices fall back to the default. */
export function effectiveSort(query: Pick<CatalogQuery, "q" | "sort">, available: SortAvailability): Exclude<CatalogSort, "popular"> | "popular" {
  const fallback = query.q ? "relevance" : "name_asc";
  const s = query.sort;
  if (!s) return fallback;
  if (s === "relevance" && !query.q) return "name_asc";
  if ((s === "price_asc" || s === "price_desc") && !available.prices) return fallback;
  if (s === "popular" && !available.popularity) return fallback;
  return s;
}

/**
 * Query string for a catalogue URL. Changing anything but the page resets the page to 1 (pass `page` explicitly
 * for pagination links). Section slugs are kept in a stable order so equal filters give equal URLs.
 */
export function catalogQueryString(query: CatalogQuery, overrides: Partial<CatalogQuery> = {}): string {
  const m: CatalogQuery = { ...query, page: 1, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  for (const c of [...m.categories].sort()) p.append("category", c);
  if (m.priceMin !== undefined) p.set("priceMin", String(m.priceMin));
  if (m.priceMax !== undefined) p.set("priceMax", String(m.priceMax));
  if (m.hasPrice) p.set("hasPrice", "1");
  if (m.hasPhoto) p.set("hasPhoto", "1");
  if (m.sort) p.set("sort", m.sort);
  if (m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Number of active filters (search text and sort are not filters). */
export function activeFilterCount(query: CatalogQuery): number {
  return query.categories.length + (query.priceMin !== undefined || query.priceMax !== undefined ? 1 : 0) + (query.hasPrice ? 1 : 0) + (query.hasPhoto ? 1 : 0);
}
