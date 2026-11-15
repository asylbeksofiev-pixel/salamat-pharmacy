// Parsing of catalogue URL parameters. Filters and sorting live in the URL so links can be shared.
import type { CatalogFilters, SortKey } from "@/server/catalog";

const SORTS: SortKey[] = ["relevance", "name", "name_desc", "price_asc", "price_desc", "updated"];

type SP = Record<string, string | string[] | undefined>;

function list(v: string | string[] | undefined, max = 20): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr
    .flatMap((x) => x.split(","))
    .map((x) => x.trim())
    .filter((x) => x && x.length <= 120)
    .slice(0, max);
}

function int(v: string | string[] | undefined, min: number, max: number): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || !/^\d{1,9}$/.test(s)) return undefined;
  const n = Number(s);
  return n >= min && n <= max ? n : undefined;
}

export function parseCatalogParams(sp: SP): CatalogFilters {
  const sort = typeof sp.sort === "string" && (SORTS as string[]).includes(sp.sort) ? (sp.sort as SortKey) : undefined;
  const rx = sp.rx === "rx" || sp.rx === "otc" ? sp.rx : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  return {
    brands: list(sp.brand),
    forms: list(sp.form),
    priceMin: int(sp.pmin, 0, 10_000_000),
    priceMax: int(sp.pmax, 0, 10_000_000),
    inStock: sp.stock === "1",
    rx,
    q,
    sort,
    page: int(sp.page, 1, 500) ?? 1,
  };
}

/** Rebuilds a query string from filters (used for pagination and "reset" links). */
export function catalogQuery(f: CatalogFilters, overrides: Partial<CatalogFilters> = {}): string {
  const m = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  for (const b of m.brands ?? []) p.append("brand", b);
  for (const x of m.forms ?? []) p.append("form", x);
  if (m.priceMin !== undefined) p.set("pmin", String(m.priceMin));
  if (m.priceMax !== undefined) p.set("pmax", String(m.priceMax));
  if (m.inStock) p.set("stock", "1");
  if (m.rx) p.set("rx", m.rx);
  if (m.sort) p.set("sort", m.sort);
  if (m.page && m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(f: CatalogFilters): boolean {
  return !!(f.brands?.length || f.forms?.length || f.priceMin !== undefined || f.priceMax !== undefined || f.inStock || f.rx);
}
