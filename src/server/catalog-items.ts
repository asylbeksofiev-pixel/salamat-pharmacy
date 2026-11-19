import "server-only";
// Catalogue of SALAMAT products loaded into public.pharmacy_products (id BIGINT PK, article TEXT, name TEXT,
// optional price / stock_quantity / image_url). Read-only: the site never writes to this table.
// Sections come from catalog_item_categories (one row per product id, see scripts/classify-catalog.ts);
// photos found by barcode come from catalog_images. A photo published into image_url from an open database
// (scripts/catalog-photos/internet.ts or the psql import in data/catalog-photos-internet/neon-import) keeps its
// source and licence in catalog_photo_results; the credit is shown only while image_url is exactly that photo
// (published_image_url — a Blob copy or the source's own URL).
//
// Filtering, sorting, counting and pagination run in SQL over the whole catalogue. Every value from the URL is a
// bound parameter (Prisma tagged templates); identifiers and ORDER BY clauses come only from fixed lists below.
//
// Price source: the network-wide price in pharmacy_products.price (when that column exists). The same value is
// shown on cards, used by the price filter and by price sorting. A missing or non-positive price means "price to be
// confirmed" — never 0 ₸: such products stay in the catalogue, are excluded by any price filter, and sort last.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { escapeLike, fixKeyboardLayout } from "@/lib/search-normalize";
import { categoryName, type Locale } from "@/lib/i18n";
import { effectiveSort, type CatalogSort } from "@/lib/catalog-params";

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_MAX_PAGE_SIZE = 48;
export const CATALOG_MAX_QUERY = 100;

/** A catalogue item. Optional fields stay null until the data really exists. */
export interface CatalogItem {
  /** BIGINT as a string: safe in JSON and URLs. */
  id: string;
  article: string | null;
  name: string;
  price: number | null;
  stockQuantity: number | null;
  /** Section name in the page language (published assignments only). */
  category: string | null;
  categorySlug: string | null;
  imageUrl: string | null;
  /** Where the photo comes from, when it is not SALAMAT's own (required by the photo's licence). */
  imageCredit: { source: string; url: string; license: string } | null;
}

export interface CatalogFilterInput {
  q?: string | null;
  /** Section ids (already expanded to subsections). Several ids are combined with OR. */
  categoryIds?: string[];
  priceMin?: number;
  priceMax?: number;
  hasPrice?: boolean;
  hasPhoto?: boolean;
}

export interface CatalogListOptions extends CatalogFilterInput {
  page?: number;
  pageSize?: number;
  sort?: CatalogSort | null;
  locale?: Locale;
}

export interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Query actually used (differs from the input when the keyboard layout was fixed). */
  query: string | null;
  layoutFixed: boolean;
  /** Sort applied (unavailable choices fall back to the default). */
  sort: CatalogSort;
}

// ---------- tables, optional columns ----------

const P = Prisma.raw(`"public"."pharmacy_products" p`);
/** Photos by barcode, the source of a published photo and the published section of each product. */
const JOINS = Prisma.raw(
  `LEFT JOIN "public"."catalog_images" ci ON ci."barcode" = btrim(p."article")
   LEFT JOIN "public"."catalog_photo_results" cpr ON cpr."product_id" = p."id" AND cpr."review_status" = 'published'
   LEFT JOIN "public"."catalog_item_categories" cic ON cic."product_id" = p."id" AND cic."review_status" IN ('auto', 'confirmed')
   LEFT JOIN "public"."Category" k ON k."id" = cic."category_id"`,
);
const BASE_COLUMNS = Prisma.raw(
  `p."id"::text AS "id", p."article", p."name",
   ci."photo_url" AS "photoUrl", ci."photo_source" AS "photoSource", ci."photo_source_url" AS "photoSourceUrl", ci."photo_license" AS "photoLicense",
   coalesce(cpr."published_image_url", cpr."stored_image_url") AS "storedUrl", coalesce(cpr."attribution", cpr."source_name") AS "storedSource",
   cpr."source_page_url" AS "storedSourceUrl", cpr."source_license" AS "storedLicense",
   k."slug" AS "categorySlug", k."nameRu" AS "categoryNameRu", k."nameKk" AS "categoryNameKk"`,
);

/** Columns that may be added to pharmacy_products later; used only when they exist (no code change needed). */
const OPTIONAL_COLUMNS = {
  price: Prisma.raw(`p."price"::float8 AS "price"`),
  stock_quantity: Prisma.raw(`p."stock_quantity"::int AS "stockQuantity"`),
  image_url: Prisma.raw(`p."image_url"::text AS "imageUrl"`),
} as const;
type OptionalColumn = keyof typeof OPTIONAL_COLUMNS;

let columnsCache: { at: number; columns: Set<OptionalColumn> } | null = null;
const COLUMNS_TTL_MS = 5 * 60_000;

async function optionalColumns(): Promise<Set<OptionalColumn>> {
  if (columnsCache && Date.now() - columnsCache.at < COLUMNS_TTL_MS) return columnsCache.columns;
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pharmacy_products'`;
  const present = new Set(rows.map((r) => r.column_name));
  const columns = new Set((Object.keys(OPTIONAL_COLUMNS) as OptionalColumn[]).filter((c) => present.has(c)));
  columnsCache = { at: Date.now(), columns };
  return columns;
}

/** Forget the detected optional columns (tests, or right after adding a column). */
export function resetCatalogColumnsCache() {
  columnsCache = null;
}

function selectList(columns: Set<OptionalColumn>) {
  return Prisma.join([BASE_COLUMNS, ...[...columns].map((c) => OPTIONAL_COLUMNS[c])], ", ");
}

interface Row {
  id: string;
  article: string | null;
  name: string | null;
  price?: number | null;
  stockQuantity?: number | null;
  imageUrl?: string | null;
  photoUrl?: string | null;
  photoSource?: string | null;
  photoSourceUrl?: string | null;
  photoLicense?: string | null;
  storedUrl?: string | null;
  storedSource?: string | null;
  storedSourceUrl?: string | null;
  storedLicense?: string | null;
  categorySlug?: string | null;
  categoryNameRu?: string | null;
  categoryNameKk?: string | null;
}

const isHttps = (u: string | null | undefined): u is string => !!u && /^https:\/\//.test(u);

function toItem(r: Row, locale: Locale): CatalogItem {
  const price = typeof r.price === "number" && Number.isFinite(r.price) && r.price > 0 ? r.price : null;
  const stock = typeof r.stockQuantity === "number" && Number.isInteger(r.stockQuantity) && r.stockQuantity >= 0 ? r.stockQuantity : null;
  // SALAMAT's own photo (image_url) wins over a photo found by barcode.
  const own = isHttps(r.imageUrl) ? r.imageUrl : null;
  const found = !own && isHttps(r.photoUrl) && r.photoSource && isHttps(r.photoSourceUrl) && r.photoLicense ? r.photoUrl : null;
  // image_url filled from an open database: its licence requires the same credit as a photo found by barcode.
  const ownCredit =
    own && r.storedUrl === own && r.storedSource && isHttps(r.storedSourceUrl) && r.storedLicense
      ? { source: r.storedSource, url: r.storedSourceUrl, license: r.storedLicense }
      : null;
  return {
    id: r.id,
    article: r.article?.trim() || null,
    name: (r.name ?? "").trim() || "—",
    price,
    stockQuantity: stock,
    category: r.categorySlug && r.categoryNameRu ? categoryName(locale, r.categorySlug, r.categoryNameRu, r.categoryNameKk) : null,
    categorySlug: r.categorySlug ?? null,
    imageUrl: own ?? found,
    imageCredit: found ? { source: r.photoSource!, url: r.photoSourceUrl!, license: r.photoLicense! } : ownCredit,
  };
}

// ---------- search ----------

/**
 * Search tokens: lower-case, ё→е, split on whitespace, surrounding punctuation stripped.
 * Punctuation inside a token is kept, so "0,5" or "ABC-123/1" match as written.
 */
export function catalogTokens(query: string): string[] {
  return query
    .slice(0, CATALOG_MAX_QUERY)
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .split(/\s+/)
    .map((t) => t.replace(/^[\s"'«»„“”.,;:!?()[\]{}]+|[\s"'«»„“”.,;:!?()[\]{}]+$/g, ""))
    .filter(Boolean)
    .slice(0, 8);
}

// Same normalisation in SQL: lower() + ё→е. Every token must match the name or the article.
const NAME_NORM = Prisma.sql`translate(lower(coalesce(p."name", '')), 'ё', 'е')`;
const ARTICLE_NORM = Prisma.sql`translate(lower(coalesce(p."article", '')), 'ё', 'е')`;
const NAME_SORT = Prisma.sql`lower(coalesce(p."name", ''))`;

function searchCondition(tokens: string[]): Prisma.Sql[] {
  return tokens.map((t) => {
    const like = `%${escapeLike(t)}%`;
    return Prisma.sql`(${NAME_NORM} LIKE ${like} ESCAPE '\\' OR ${ARTICLE_NORM} LIKE ${like} ESCAPE '\\')`;
  });
}

// ---------- filters ----------

function priceExpr(columns: Set<OptionalColumn>) {
  return columns.has("price") ? Prisma.sql`(CASE WHEN p."price" > 0 THEN p."price"::float8 END)` : null;
}

function photoCondition(columns: Set<OptionalColumn>) {
  const found = Prisma.sql`(ci."photo_url" LIKE 'https://%' AND ci."photo_source_url" LIKE 'https://%' AND ci."photo_source" IS NOT NULL AND ci."photo_license" IS NOT NULL)`;
  return columns.has("image_url") ? Prisma.sql`(p."image_url" LIKE 'https://%' OR ${found})` : found;
}

/** WHERE parts; the section filter can be left out (for per-section counts). */
function conditions(f: CatalogFilterInput, tokens: string[], columns: Set<OptionalColumn>, withCategory = true): Prisma.Sql[] {
  const parts = searchCondition(tokens);
  if (withCategory && f.categoryIds?.length) parts.push(Prisma.sql`cic."category_id" IN (${Prisma.join(f.categoryIds)})`);
  const price = priceExpr(columns);
  if (f.hasPrice || f.priceMin !== undefined || f.priceMax !== undefined) {
    if (!price) parts.push(Prisma.sql`FALSE`);
    else {
      parts.push(Prisma.sql`${price} IS NOT NULL`);
      if (f.priceMin !== undefined) parts.push(Prisma.sql`${price} >= ${f.priceMin}`);
      if (f.priceMax !== undefined) parts.push(Prisma.sql`${price} <= ${f.priceMax}`);
    }
  }
  if (f.hasPhoto) parts.push(photoCondition(columns));
  return parts;
}

const where = (parts: Prisma.Sql[]) => (parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`);

/** ORDER BY from a fixed list. Ties are always broken by the unique id, so pages never repeat or skip products. */
function orderBy(sort: CatalogSort, tokens: string[], columns: Set<OptionalColumn>): Prisma.Sql {
  const price = priceExpr(columns);
  switch (sort) {
    case "relevance": {
      if (!tokens.length) break;
      const prefix = `${escapeLike(tokens[0])}%`;
      return Prisma.sql`(CASE WHEN ${NAME_NORM} LIKE ${prefix} ESCAPE '\\' OR ${ARTICLE_NORM} LIKE ${prefix} ESCAPE '\\' THEN 0 ELSE 1 END) ASC, ${NAME_SORT} ASC, p."id" ASC`;
    }
    case "price_asc":
      if (price) return Prisma.sql`${price} ASC NULLS LAST, ${NAME_SORT} ASC, p."id" ASC`;
      break;
    case "price_desc":
      if (price) return Prisma.sql`${price} DESC NULLS LAST, ${NAME_SORT} ASC, p."id" ASC`;
      break;
    case "name_desc":
      return Prisma.sql`${NAME_SORT} DESC, p."id" DESC`;
    default:
      break;
  }
  return Prisma.sql`${NAME_SORT} ASC, p."id" ASC`;
}

export function clampPageSize(n: number | undefined): number {
  if (!n || !Number.isInteger(n) || n < 1) return CATALOG_PAGE_SIZE;
  return Math.min(n, CATALOG_MAX_PAGE_SIZE);
}

// ---------- data facts ----------

export interface CatalogFacts {
  /** pharmacy_products.price exists and at least one product has a positive price. */
  pricesAvailable: boolean;
  priceRange: { min: number; max: number } | null;
  /** There is no reliable popularity metric for catalogue products yet (requests are not linked to product ids). */
  popularityAvailable: boolean;
}

export async function getCatalogFacts(): Promise<CatalogFacts> {
  const columns = await optionalColumns();
  let priceRange: CatalogFacts["priceRange"] = null;
  if (columns.has("price")) {
    const [r] = await prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
      SELECT min(p."price")::float8 AS min, max(p."price")::float8 AS max FROM ${P} WHERE p."price" > 0`;
    if (r?.min !== null && r?.min !== undefined && r.max !== null) priceRange = { min: Math.floor(r.min), max: Math.ceil(r.max) };
  }
  return { pricesAvailable: !!priceRange, priceRange, popularityAvailable: false };
}

// ---------- listing ----------

export async function listCatalogItems(opts: CatalogListOptions): Promise<CatalogPage> {
  const pageSize = clampPageSize(opts.pageSize);
  const page = Math.max(1, Math.min(10_000, Math.floor(opts.page ?? 1)));
  const locale = opts.locale ?? "ru";
  const columns = await optionalColumns();
  const select = selectList(columns);

  const run = async (q: string | null) => {
    const tokens = q ? catalogTokens(q) : [];
    const cond = where(conditions(opts, tokens, columns));
    const sort = effectiveSort({ q: q ?? "", sort: opts.sort ?? null }, { prices: columns.has("price"), popularity: false });
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM ${P} ${JOINS} WHERE ${cond}`,
      prisma.$queryRaw<Row[]>`SELECT ${select} FROM ${P} ${JOINS} WHERE ${cond}
        ORDER BY ${orderBy(sort, tokens, columns)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ]);
    return { total: Number(countRows[0]?.total ?? 0), rows, sort };
  };

  let query = opts.q?.trim() ? opts.q.trim().slice(0, CATALOG_MAX_QUERY) : null;
  let layoutFixed = false;
  let res = await run(query);
  if (query && res.total === 0) {
    // "gfhfwtnfvjk" → "парацетамол"
    const fixed = fixKeyboardLayout(query);
    if (fixed) {
      const alt = await run(fixed);
      if (alt.total > 0) {
        res = alt;
        query = fixed;
        layoutFixed = true;
      }
    }
  }
  return {
    items: res.rows.map((r) => toItem(r, locale)),
    total: res.total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(res.total / pageSize)),
    query,
    layoutFixed,
    sort: res.sort,
  };
}

/**
 * Products per section id for the current search and filters, ignoring the section filter itself
 * (so the counts tell how many products each section option would give).
 */
export async function countCatalogItemsByCategory(f: CatalogFilterInput): Promise<Map<string, number>> {
  const columns = await optionalColumns();
  const tokens = f.q ? catalogTokens(f.q) : [];
  const cond = where([...conditions(f, tokens, columns, false), Prisma.sql`cic."category_id" IS NOT NULL`]);
  const rows = await prisma.$queryRaw<{ id: string; n: bigint }[]>`
    SELECT cic."category_id" AS id, COUNT(*) AS n FROM ${P} ${JOINS} WHERE ${cond} GROUP BY 1`;
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

/** Valid BIGINT id in decimal form (positive, at most 18 digits — always within BIGINT range). */
export function isCatalogId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,17}$/.test(value);
}

export async function getCatalogItem(id: string, locale: Locale = "ru"): Promise<CatalogItem | null> {
  if (!isCatalogId(id)) return null;
  const columns = await optionalColumns();
  const rows = await prisma.$queryRaw<Row[]>`SELECT ${selectList(columns)} FROM ${P} ${JOINS} WHERE p."id" = ${BigInt(id)} LIMIT 1`;
  return rows[0] ? toItem(rows[0], locale) : null;
}

/** Items for the favourites page and requests, in the given order; unknown ids are skipped. */
export async function listCatalogItemsByIds(ids: string[], locale: Locale = "ru"): Promise<CatalogItem[]> {
  const valid = Array.from(new Set(ids.filter(isCatalogId))).slice(0, 100);
  if (!valid.length) return [];
  const columns = await optionalColumns();
  const rows = await prisma.$queryRaw<Row[]>`SELECT ${selectList(columns)} FROM ${P} ${JOINS} WHERE p."id" IN (${Prisma.join(valid.map((id) => BigInt(id)))})`;
  const byId = new Map(rows.map((r) => [r.id, toItem(r, locale)]));
  return valid.map((id) => byId.get(id)).filter((x): x is CatalogItem => !!x);
}

/**
 * A few catalogue products for the home page. Not "popular" or "recommended" (there is no such data): just a
 * stable selection — products with a photo first, then names that start with a letter, then by name and id —
 * so the set does not change between page loads while the catalogue stays the same.
 */
export async function listCatalogPreview(limit = 4, locale: Locale = "ru"): Promise<CatalogItem[]> {
  const n = Math.max(1, Math.min(12, Math.floor(limit)));
  const columns = await optionalColumns();
  const noPhoto = Prisma.sql`NOT ${photoCondition(columns)}`;
  const rows = await prisma.$queryRaw<Row[]>`SELECT ${selectList(columns)} FROM ${P} ${JOINS}
    WHERE btrim(coalesce(p."name", '')) <> ''
    ORDER BY ${noPhoto} ASC,
      (coalesce(p."name", '') ~ '^[[:alpha:]]') DESC,
      ${NAME_SORT} ASC, p."id" ASC
    LIMIT ${n}`;
  return rows.map((r) => toItem(r, locale));
}

/** Up to `limit` matches for the header search suggestions. */
export async function suggestCatalogItems(q: string, limit = 7, locale: Locale = "ru"): Promise<{ items: CatalogItem[]; query: string }> {
  const res = await listCatalogItems({ q, page: 1, pageSize: limit, locale, sort: "relevance" });
  return { items: res.items, query: res.query ?? q };
}
