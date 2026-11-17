import "server-only";
// Catalogue of SALAMAT products loaded into public.pharmacy_products (id BIGINT PK, article TEXT, name TEXT).
// Read-only: the site never writes to this table, and never touches public.pharmacy_products_import.
// All queries are parameterised (Prisma tagged templates); only whitelisted identifiers are inlined.
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { escapeLike, fixKeyboardLayout } from "@/lib/search-normalize";

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_MAX_PAGE_SIZE = 48;
export const CATALOG_MAX_QUERY = 100;

/** A catalogue item. Optional fields stay null until the columns exist in the table AND hold real values. */
export interface CatalogItem {
  /** BIGINT as a string: safe in JSON and URLs. */
  id: string;
  article: string | null;
  name: string;
  price: number | null;
  stockQuantity: number | null;
  category: string | null;
  imageUrl: string | null;
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
}

const TABLE = Prisma.raw(`"public"."pharmacy_products"`);

/**
 * Columns that will be added later. They are used only if they exist in the table, so adding them
 * (ALTER TABLE ... ADD COLUMN, see docs/catalog-products.md) needs no code change.
 */
const OPTIONAL_COLUMNS = {
  price: Prisma.raw(`"price"::float8 AS "price"`),
  stock_quantity: Prisma.raw(`"stock_quantity"::int AS "stockQuantity"`),
  category: Prisma.raw(`"category"::text AS "category"`),
  image_url: Prisma.raw(`"image_url"::text AS "imageUrl"`),
} as const;
type OptionalColumn = keyof typeof OPTIONAL_COLUMNS;

let columnsCache: { at: number; columns: OptionalColumn[] } | null = null;
const COLUMNS_TTL_MS = 5 * 60_000;

async function optionalColumns(): Promise<OptionalColumn[]> {
  if (columnsCache && Date.now() - columnsCache.at < COLUMNS_TTL_MS) return columnsCache.columns;
  const rows = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pharmacy_products'`;
  const present = new Set(rows.map((r) => r.column_name));
  const columns = (Object.keys(OPTIONAL_COLUMNS) as OptionalColumn[]).filter((c) => present.has(c));
  columnsCache = { at: Date.now(), columns };
  return columns;
}

function selectList(columns: OptionalColumn[]) {
  return Prisma.join([Prisma.sql`"id"::text AS "id"`, Prisma.sql`"article"`, Prisma.sql`"name"`, ...columns.map((c) => OPTIONAL_COLUMNS[c])], ", ");
}

interface Row {
  id: string;
  article: string | null;
  name: string | null;
  price?: number | null;
  stockQuantity?: number | null;
  category?: string | null;
  imageUrl?: string | null;
}

function toItem(r: Row): CatalogItem {
  const price = typeof r.price === "number" && Number.isFinite(r.price) && r.price > 0 ? r.price : null;
  const stock = typeof r.stockQuantity === "number" && Number.isInteger(r.stockQuantity) && r.stockQuantity >= 0 ? r.stockQuantity : null;
  const image = r.imageUrl && /^https:\/\//.test(r.imageUrl) ? r.imageUrl : null;
  return {
    id: r.id,
    article: r.article?.trim() || null,
    name: (r.name ?? "").trim() || "—",
    price,
    stockQuantity: stock,
    category: r.category?.trim() || null,
    imageUrl: image,
  };
}

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
const NAME_NORM = Prisma.sql`translate(lower(coalesce("name", '')), 'ё', 'е')`;
const ARTICLE_NORM = Prisma.sql`translate(lower(coalesce("article", '')), 'ё', 'е')`;

function whereFor(tokens: string[]) {
  if (!tokens.length) return Prisma.sql`TRUE`;
  return Prisma.join(
    tokens.map((t) => {
      const like = `%${escapeLike(t)}%`;
      return Prisma.sql`(${NAME_NORM} LIKE ${like} ESCAPE '\\' OR ${ARTICLE_NORM} LIKE ${like} ESCAPE '\\')`;
    }),
    " AND ",
  );
}

/**
 * Deterministic order (ties broken by the unique id), so OFFSET pagination never repeats or skips rows.
 * With a query, names starting with the first token come first.
 */
function orderFor(tokens: string[]) {
  if (!tokens.length) return Prisma.sql`lower(coalesce("name", '')) ASC, "id" ASC`;
  const prefix = `${escapeLike(tokens[0])}%`;
  return Prisma.sql`(CASE WHEN ${NAME_NORM} LIKE ${prefix} ESCAPE '\\' OR ${ARTICLE_NORM} LIKE ${prefix} ESCAPE '\\' THEN 0 ELSE 1 END) ASC,
    lower(coalesce("name", '')) ASC, "id" ASC`;
}

export function clampPageSize(n: number | undefined): number {
  if (!n || !Number.isInteger(n) || n < 1) return CATALOG_PAGE_SIZE;
  return Math.min(n, CATALOG_MAX_PAGE_SIZE);
}

export async function listCatalogItems(opts: { q?: string | null; page?: number; pageSize?: number }): Promise<CatalogPage> {
  const pageSize = clampPageSize(opts.pageSize);
  const page = Math.max(1, Math.min(100_000, Math.floor(opts.page ?? 1)));
  const columns = await optionalColumns();
  const select = selectList(columns);

  const run = async (q: string | null) => {
    const tokens = q ? catalogTokens(q) : [];
    const where = whereFor(tokens);
    const [countRows, rows] = await Promise.all([
      prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${where}`,
      prisma.$queryRaw<Row[]>`SELECT ${select} FROM ${TABLE} WHERE ${where}
        ORDER BY ${orderFor(tokens)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ]);
    return { total: Number(countRows[0]?.total ?? 0), rows };
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
    items: res.rows.map(toItem),
    total: res.total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(res.total / pageSize)),
    query,
    layoutFixed,
  };
}

/** Valid BIGINT id in decimal form (positive, at most 18 digits — always within BIGINT range). */
export function isCatalogId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,17}$/.test(value);
}

export async function getCatalogItem(id: string): Promise<CatalogItem | null> {
  if (!isCatalogId(id)) return null;
  const columns = await optionalColumns();
  const rows = await prisma.$queryRaw<Row[]>`SELECT ${selectList(columns)} FROM ${TABLE} WHERE "id" = ${BigInt(id)} LIMIT 1`;
  return rows[0] ? toItem(rows[0]) : null;
}

/** Items for the favourites page, in the given order; unknown ids are skipped. */
export async function listCatalogItemsByIds(ids: string[]): Promise<CatalogItem[]> {
  const valid = Array.from(new Set(ids.filter(isCatalogId))).slice(0, 100);
  if (!valid.length) return [];
  const columns = await optionalColumns();
  const rows = await prisma.$queryRaw<Row[]>`SELECT ${selectList(columns)} FROM ${TABLE} WHERE "id" IN (${Prisma.join(valid.map((id) => BigInt(id)))})`;
  const byId = new Map(rows.map((r) => [r.id, toItem(r)]));
  return valid.map((id) => byId.get(id)).filter((x): x is CatalogItem => !!x);
}

/** Up to `limit` matches for the header search suggestions. */
export async function suggestCatalogItems(q: string, limit = 7): Promise<{ items: CatalogItem[]; query: string }> {
  const res = await listCatalogItems({ q, page: 1, pageSize: limit });
  return { items: res.items, query: res.query ?? q };
}
