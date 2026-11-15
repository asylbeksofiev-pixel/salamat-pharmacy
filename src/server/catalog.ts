import "server-only";
import { Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "./db";
import { env } from "./env";
import { getSettings } from "./settings";
import { computeOffer, type Offer, type PrescriptionValue, type StockStatusValue } from "@/lib/offer";
import { escapeLike, fixKeyboardLayout, normalizeSearchText, tokenize } from "@/lib/search-normalize";
import type { Locale } from "@/lib/i18n";
import { pickLocalized } from "@/lib/i18n";

export const PAGE_SIZE = 24;

export type SortKey = "name" | "name_desc" | "price_asc" | "price_desc" | "updated" | "relevance";
export const SORT_KEYS: SortKey[] = ["relevance", "name", "name_desc", "price_asc", "price_desc", "updated"];

export interface CatalogFilters {
  categorySlug?: string;
  brands?: string[];
  forms?: string[];
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  rx?: "rx" | "otc";
  q?: string;
  sort?: SortKey;
  page?: number;
}

export interface PromoBadge {
  slug: string;
  type: "DISCOUNT" | "BONUS" | "OTHER";
  title: string;
  benefitValue: number | null;
  benefitUnit: "KZT" | "PERCENT" | null;
}

export interface VariantCard {
  id: string;
  slug: string;
  fullName: string;
  productName: string;
  productSlug: string;
  brandName: string | null;
  form: string | null;
  dosage: string | null;
  volume: string | null;
  packageSize: string | null;
  imageUrl: string | null;
  prescriptionStatus: PrescriptionValue;
  offer: Offer;
  minPriceKzt: number | null;
  priceCount: number;
  promos: PromoBadge[];
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  nameRu: string;
  iconKey: string | null;
  sortOrder: number;
  children: CategoryNode[];
}

// ---------- categories ----------

export const getCategoryTree = cache(async (locale: Locale) => {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameRu: "asc" }],
  });
  const nodes = new Map<string, CategoryNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      slug: r.slug,
      name: pickLocalized(locale, r.nameRu, r.nameKk),
      nameRu: r.nameRu,
      iconKey: r.iconKey,
      sortOrder: r.sortOrder,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else if (!n.parentId) roots.push(n);
  }
  return { roots, bySlug: new Map([...nodes.values()].map((n) => [n.slug, n])), byId: nodes };
});

export function descendantIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(descendantIds)];
}

export function categoryPath(node: CategoryNode, byId: Map<string, CategoryNode>): CategoryNode[] {
  const path: CategoryNode[] = [];
  let cur: CategoryNode | undefined = node;
  let guard = 0;
  while (cur && guard++ < 10) {
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

// ---------- listing ----------

interface RawRow {
  id: string;
  slug: string;
  fullName: string;
  dosage: string | null;
  form: string | null;
  volume: string | null;
  packageSize: string | null;
  imageUrl: string | null;
  prescriptionStatus: PrescriptionValue;
  productId: string;
  productName: string;
  productNameKk: string | null;
  productSlug: string;
  categoryId: string | null;
  brandName: string | null;
  priceKzt: number | null;
  oldPriceKzt: number | null;
  priceUpdatedAt: Date | null;
  stockStatus: StockStatusValue | null;
  quantity: number | null;
  stockUpdatedAt: Date | null;
  minPrice: number | null;
  priceCount: bigint | number | null;
  total: bigint | number;
}

function visibilitySql() {
  return Prisma.sql`p."publicationStatus" = 'PUBLISHED' AND v."isActive" = true
    AND (ds.id IS NULL OR ds."isDemo" = false OR ${env.showDemoData})`;
}

function tokenConditions(tokens: string[]) {
  return tokens.map((t) => Prisma.sql`v."searchText" ILIKE ${"%" + escapeLike(t) + "%"} ESCAPE '\\'`);
}

export interface ListResult {
  items: VariantCard[];
  total: number;
  page: number;
  pageCount: number;
  usedQuery: string | null;
  layoutFixed: boolean;
}

export async function listVariants(opts: {
  locale: Locale;
  pharmacyId: string | null;
  categoryIds?: string[] | null;
  /** Restrict to these variants (favorites, editorial picks). */
  variantIds?: string[] | null;
  filters: CatalogFilters;
  pageSize?: number;
}): Promise<ListResult> {
  const settings = await getSettings();
  const policy = settings.offerPolicy;
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, Math.min(500, Math.floor(opts.filters.page ?? 1)));
  const f = opts.filters;
  const now = new Date();
  const priceFreshSince = new Date(now.getTime() - policy.priceStaleHours * 3600_000);
  const stockFreshSince = new Date(now.getTime() - policy.stockStaleHours * 3600_000);
  const ph = opts.pharmacyId;

  const run = async (query: string | null) => {
    const tokens = query ? tokenize(query) : [];
    const conds: Prisma.Sql[] = [visibilitySql()];
    if (opts.categoryIds && opts.categoryIds.length) conds.push(Prisma.sql`p."categoryId" IN (${Prisma.join(opts.categoryIds)})`);
    if (opts.variantIds) {
      if (!opts.variantIds.length) return [] as RawRow[];
      conds.push(Prisma.sql`v.id IN (${Prisma.join(opts.variantIds)})`);
    }
    if (f.brands?.length) conds.push(Prisma.sql`b.slug IN (${Prisma.join(f.brands)})`);
    if (f.forms?.length) conds.push(Prisma.sql`v.form IN (${Prisma.join(f.forms)})`);
    if (f.rx === "rx") conds.push(Prisma.sql`v."prescriptionStatus" = 'PRESCRIPTION'`);
    if (f.rx === "otc") conds.push(Prisma.sql`v."prescriptionStatus" = 'NON_PRESCRIPTION'`);
    if (ph) {
      if (f.priceMin !== undefined) conds.push(Prisma.sql`pr."priceKzt" >= ${f.priceMin}`);
      if (f.priceMax !== undefined) conds.push(Prisma.sql`pr."priceKzt" <= ${f.priceMax}`);
      if (f.priceMin !== undefined || f.priceMax !== undefined)
        conds.push(Prisma.sql`pr."sourceUpdatedAt" >= ${priceFreshSince}`);
      if (f.inStock)
        conds.push(Prisma.sql`inv.status IN ('IN_STOCK','LOW_STOCK') AND inv."sourceUpdatedAt" >= ${stockFreshSince}
          AND (inv.quantity IS NULL OR inv.quantity > 0)`);
    }
    conds.push(...tokenConditions(tokens));

    const normQ = query ? normalizeSearchText(query) : "";
    let sort: SortKey = f.sort ?? (tokens.length ? "relevance" : "name");
    if (sort === "relevance" && !tokens.length) sort = "name";
    const priceExpr = ph ? Prisma.sql`pr."priceKzt"` : Prisma.sql`agg."minPrice"`;
    const order =
      sort === "name_desc"
        ? Prisma.sql`lower(v."fullName") DESC, v.id`
        : sort === "price_asc"
          ? Prisma.sql`${priceExpr} ASC NULLS LAST, lower(v."fullName"), v.id`
          : sort === "price_desc"
            ? Prisma.sql`${priceExpr} DESC NULLS LAST, lower(v."fullName"), v.id`
            : sort === "updated"
              ? Prisma.sql`GREATEST(v."updatedAt", COALESCE(pr."sourceUpdatedAt", v."updatedAt"), COALESCE(inv."sourceUpdatedAt", v."updatedAt")) DESC, v.id`
              : sort === "relevance"
                ? Prisma.sql`(CASE WHEN v."searchText" LIKE ${escapeLike(normQ) + "%"} ESCAPE '\\' THEN 1 ELSE 0 END) DESC,
                    word_similarity(${normQ}, v."searchText") DESC, lower(v."fullName"), v.id`
                : Prisma.sql`lower(v."fullName") ASC, v.id`;

    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT v.id, v.slug, v."fullName", v.dosage, v.form, v.volume, v."packageSize", v."imageUrl",
             v."prescriptionStatus"::text AS "prescriptionStatus",
             p.id AS "productId", p.name AS "productName", p."nameKk" AS "productNameKk", p.slug AS "productSlug",
             p."categoryId", b.name AS "brandName",
             pr."priceKzt", pr."oldPriceKzt", pr."sourceUpdatedAt" AS "priceUpdatedAt",
             inv.status::text AS "stockStatus", inv.quantity, inv."sourceUpdatedAt" AS "stockUpdatedAt",
             agg."minPrice", agg."priceCount",
             COUNT(*) OVER() AS total
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      LEFT JOIN "DataSource" ds ON ds.id = v."sourceId"
      LEFT JOIN "Price" pr ON pr."variantId" = v.id AND pr."pharmacyId" = ${ph ?? ""}
      LEFT JOIN "Inventory" inv ON inv."variantId" = v.id AND inv."pharmacyId" = ${ph ?? ""}
      LEFT JOIN LATERAL (
        SELECT MIN(pp."priceKzt") AS "minPrice", COUNT(*) AS "priceCount"
        FROM "Price" pp JOIN "Pharmacy" phx ON phx.id = pp."pharmacyId" AND phx."isActive" = true
        WHERE pp."variantId" = v.id AND pp."sourceUpdatedAt" >= ${priceFreshSince}
      ) agg ON true
      WHERE ${Prisma.join(conds, " AND ")}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return rows;
  };

  let usedQuery = f.q?.trim() || null;
  let layoutFixed = false;
  let rows = await run(usedQuery);
  if (usedQuery && rows.length === 0) {
    const fixed = fixKeyboardLayout(usedQuery);
    if (fixed) {
      const alt = await run(fixed);
      if (alt.length) {
        rows = alt;
        usedQuery = fixed;
        layoutFixed = true;
      }
    }
  }

  const total = rows.length ? Number(rows[0].total) : 0;
  const promos = await promosForVariants(
    rows.map((r) => ({ id: r.id, categoryId: r.categoryId })),
    ph,
    opts.locale,
  );
  const items: VariantCard[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    fullName: r.fullName,
    productName: pickLocalized(opts.locale, r.productName, r.productNameKk),
    productSlug: r.productSlug,
    brandName: r.brandName,
    form: r.form,
    dosage: r.dosage,
    volume: r.volume,
    packageSize: r.packageSize,
    imageUrl: r.imageUrl,
    prescriptionStatus: r.prescriptionStatus,
    offer: computeOffer({
      hasPharmacy: !!ph,
      price: r.priceKzt !== null && r.priceUpdatedAt ? { priceKzt: r.priceKzt, oldPriceKzt: r.oldPriceKzt, sourceUpdatedAt: r.priceUpdatedAt } : null,
      inventory: r.stockStatus && r.stockUpdatedAt ? { status: r.stockStatus, quantity: r.quantity, sourceUpdatedAt: r.stockUpdatedAt } : null,
      prescriptionStatus: r.prescriptionStatus,
      policy,
      now,
    }),
    minPriceKzt: r.minPrice ?? null,
    priceCount: Number(r.priceCount ?? 0),
    promos: promos.get(r.id) ?? [],
  }));
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), usedQuery, layoutFixed };
}

// ---------- facets ----------

export interface Facets {
  brands: { slug: string; name: string; count: number }[];
  forms: { value: string; count: number }[];
  priceRange: { min: number; max: number } | null;
  hasRxData: boolean;
}

export async function getFacets(opts: { pharmacyId: string | null; categoryIds?: string[] | null; q?: string | null }): Promise<Facets> {
  const conds: Prisma.Sql[] = [visibilitySql()];
  if (opts.categoryIds && opts.categoryIds.length) conds.push(Prisma.sql`p."categoryId" IN (${Prisma.join(opts.categoryIds)})`);
  if (opts.q) conds.push(...tokenConditions(tokenize(opts.q)));
  const where = Prisma.join(conds, " AND ");
  const base = Prisma.sql`FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN "Brand" b ON b.id = p."brandId" LEFT JOIN "DataSource" ds ON ds.id = v."sourceId"`;
  const [brands, forms, rx] = await Promise.all([
    prisma.$queryRaw<{ slug: string; name: string; count: bigint }[]>`
      SELECT b.slug, b.name, COUNT(*) AS count ${base} WHERE ${where} AND b.id IS NOT NULL
      GROUP BY b.slug, b.name ORDER BY lower(b.name) LIMIT 60`,
    prisma.$queryRaw<{ value: string; count: bigint }[]>`
      SELECT v.form AS value, COUNT(*) AS count ${base} WHERE ${where} AND v.form IS NOT NULL AND v.form <> ''
      GROUP BY v.form ORDER BY lower(v.form) LIMIT 40`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n ${base} WHERE ${where} AND v."prescriptionStatus" <> 'UNKNOWN'`,
  ]);
  let priceRange: Facets["priceRange"] = null;
  if (opts.pharmacyId) {
    const r = await prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
      SELECT MIN(pr."priceKzt") AS min, MAX(pr."priceKzt") AS max ${base}
      JOIN "Price" pr ON pr."variantId" = v.id AND pr."pharmacyId" = ${opts.pharmacyId}
      WHERE ${where}`;
    if (r[0]?.min != null && r[0]?.max != null) priceRange = { min: r[0].min, max: r[0].max };
  }
  return {
    brands: brands.map((b) => ({ slug: b.slug, name: b.name, count: Number(b.count) })),
    forms: forms.map((x) => ({ value: x.value, count: Number(x.count) })),
    priceRange,
    hasRxData: Number(rx[0]?.n ?? 0) > 0,
  };
}

// ---------- promotions ----------

export function activePromotionWhere(now = new Date()): Prisma.PromotionWhereInput {
  return {
    status: "PUBLISHED",
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export async function promosForVariants(
  variants: { id: string; categoryId: string | null }[],
  pharmacyId: string | null,
  locale: Locale,
): Promise<Map<string, PromoBadge[]>> {
  const out = new Map<string, PromoBadge[]>();
  if (!variants.length) return out;
  const variantIds = variants.map((v) => v.id);
  const categoryIds = Array.from(new Set(variants.map((v) => v.categoryId).filter((c): c is string => !!c)));
  const promos = await prisma.promotion.findMany({
    where: {
      AND: [
        activePromotionWhere(),
        { OR: [{ variants: { some: { variantId: { in: variantIds } } } }, { categories: { some: { categoryId: { in: categoryIds } } } }] },
        pharmacyId ? { OR: [{ appliesToAllPharmacies: true }, { pharmacies: { some: { pharmacyId } } }] } : {},
      ],
    },
    include: {
      variants: { where: { variantId: { in: variantIds } }, select: { variantId: true } },
      categories: { select: { categoryId: true } },
    },
    take: 50,
  });
  for (const v of variants) {
    const list: PromoBadge[] = [];
    for (const p of promos) {
      const hit = p.variants.some((x) => x.variantId === v.id) || (v.categoryId && p.categories.some((c) => c.categoryId === v.categoryId));
      if (hit)
        list.push({
          slug: p.slug,
          type: p.type,
          title: pickLocalized(locale, p.titleRu, p.titleKk),
          benefitValue: p.benefitValue,
          benefitUnit: p.benefitUnit,
        });
    }
    if (list.length) out.set(v.id, list);
  }
  return out;
}

// ---------- suggestions ----------

export interface Suggestion {
  type: "variant" | "category";
  label: string;
  sublabel?: string;
  href: string;
}

export async function suggest(q: string, locale: Locale): Promise<{ items: Suggestion[]; query: string }> {
  const run = async (query: string) => {
    const tokens = tokenize(query);
    if (!tokens.length) return [] as Suggestion[];
    const normQ = normalizeSearchText(query);
    const rows = await prisma.$queryRaw<{ slug: string; fullName: string; productSlug: string; brandName: string | null }[]>`
      SELECT v.slug, v."fullName", p.slug AS "productSlug", b.name AS "brandName"
      FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
      LEFT JOIN "Brand" b ON b.id = p."brandId" LEFT JOIN "DataSource" ds ON ds.id = v."sourceId"
      WHERE ${visibilitySql()} AND ${Prisma.join(tokenConditions(tokens), " AND ")}
      ORDER BY (CASE WHEN v."searchText" LIKE ${escapeLike(normQ) + "%"} ESCAPE '\\' THEN 1 ELSE 0 END) DESC,
               word_similarity(${normQ}, v."searchText") DESC, lower(v."fullName")
      LIMIT 7`;
    const cats = await prisma.category.findMany({
      where: {
        isActive: true,
        OR: [{ nameRu: { contains: query, mode: "insensitive" } }, { nameKk: { contains: query, mode: "insensitive" } }],
      },
      take: 3,
      orderBy: { sortOrder: "asc" },
    });
    const prefix = locale === "kk" ? "/kk" : "";
    return [
      ...cats.map<Suggestion>((c) => ({
        type: "category",
        label: pickLocalized(locale, c.nameRu, c.nameKk),
        href: `${prefix}/catalog/${c.slug}`,
      })),
      ...rows.map<Suggestion>((r) => ({
        type: "variant",
        label: r.fullName,
        sublabel: r.brandName ?? undefined,
        href: `${prefix}/product/${r.productSlug}?sku=${encodeURIComponent(r.slug)}`,
      })),
    ];
  };
  let items = await run(q);
  let query = q;
  if (!items.length) {
    const fixed = fixKeyboardLayout(q);
    if (fixed) {
      items = await run(fixed);
      if (items.length) query = fixed;
    }
  }
  return { items, query };
}
