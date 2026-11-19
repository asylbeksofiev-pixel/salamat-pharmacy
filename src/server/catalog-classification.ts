// Classification of catalogue products into sections, stored in catalog_item_categories (one row per product id).
// Shared by scripts/classify-catalog.ts (dry run, apply, rollback, verify) and the integration tests.
// Rules: products are read from public.pharmacy_products by id; names, articles, photos, prices, carts and requests
// are never touched. Rows confirmed by a person (review_status = 'confirmed') are never overwritten automatically.
// No "server-only" import on purpose: this module is used from Node scripts as well.
import { Prisma, type PrismaClient } from "@prisma/client";
import { CATEGORY_SLUGS, CLASSIFIER_VERSION, classifyName, type CategorySlug, type Classification } from "@/lib/catalog-classify";

type Db = PrismaClient;

export interface CategoryRef {
  id: string;
  slug: string;
  nameRu: string;
}

export interface Override {
  slug: CategorySlug;
  note: string;
}

export interface Assignment {
  categoryId: string | null;
  confidence: number;
  method: string;
  reason: string;
  reviewStatus: "auto" | "needs_review" | "confirmed";
  classifierVersion: string;
}

export interface PlanItem {
  productId: bigint;
  article: string | null;
  name: string;
  categorySlug: CategorySlug | null;
  next: Assignment;
  previous: Assignment | null;
  action: "create" | "update" | "unchanged" | "keep-confirmed";
}

export interface PlanStats {
  products: number;
  create: number;
  update: number;
  unchanged: number;
  keptConfirmed: number;
  overrides: number;
  byCategory: Record<string, number>;
  needsReview: number;
  needsReviewWithSuggestion: number;
  needsReviewWithoutSuggestion: number;
  orphanRows: number;
}

export async function loadCategories(db: Db): Promise<{ bySlug: Map<string, CategoryRef>; byId: Map<string, CategoryRef>; missing: CategorySlug[] }> {
  const rows = await db.category.findMany({ where: { slug: { in: [...CATEGORY_SLUGS] } }, select: { id: true, slug: true, nameRu: true } });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return { bySlug, byId: new Map(rows.map((r) => [r.id, r])), missing: CATEGORY_SLUGS.filter((s) => !bySlug.has(s)) };
}

/** All products, read in id order in batches (the table is outside Prisma's schema). */
export async function readProducts(db: Db, batch = 2000): Promise<{ id: bigint; article: string | null; name: string | null }[]> {
  const out: { id: bigint; article: string | null; name: string | null }[] = [];
  let after = BigInt(0);
  for (;;) {
    const rows = await db.$queryRaw<{ id: bigint; article: string | null; name: string | null }[]>`
      SELECT "id", "article", "name" FROM "public"."pharmacy_products" WHERE "id" > ${after} ORDER BY "id" LIMIT ${batch}`;
    out.push(...rows);
    if (rows.length < batch) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}

function toAssignment(r: { categoryId: string | null; confidence: Prisma.Decimal | number; method: string; reason: string; reviewStatus: string; classifierVersion: string }): Assignment {
  return {
    categoryId: r.categoryId,
    confidence: Number(r.confidence),
    method: r.method,
    reason: r.reason,
    reviewStatus: r.reviewStatus as Assignment["reviewStatus"],
    classifierVersion: r.classifierVersion,
  };
}

const same = (a: Assignment, b: Assignment) =>
  a.categoryId === b.categoryId && a.confidence === b.confidence && a.method === b.method && a.reason === b.reason && a.reviewStatus === b.reviewStatus && a.classifierVersion === b.classifierVersion;

/** Turns a rule result (or a manual override) into a stored assignment. */
export function assignmentFor(c: Classification, categories: Map<string, CategoryRef>, override?: Override): { slug: CategorySlug | null; next: Assignment } {
  if (override) {
    const cat = categories.get(override.slug);
    if (!cat) throw new Error(`Override uses an unknown category: ${override.slug}`);
    return {
      slug: override.slug,
      next: { categoryId: cat.id, confidence: 1, method: "manual:overrides-file", reason: override.note || "Подтверждено вручную", reviewStatus: "confirmed", classifierVersion: CLASSIFIER_VERSION },
    };
  }
  const cat = c.category ? categories.get(c.category) : undefined;
  return {
    slug: c.category,
    next: {
      categoryId: cat?.id ?? null,
      confidence: c.confidence,
      method: c.method,
      reason: c.reason,
      reviewStatus: cat ? c.reviewStatus : "needs_review",
      classifierVersion: CLASSIFIER_VERSION,
    },
  };
}

/** Dry run: what an apply would do. Writes nothing. */
export async function planClassification(db: Db, opts: { overrides?: Map<string, Override> } = {}): Promise<{ items: PlanItem[]; stats: PlanStats; missingCategories: CategorySlug[] }> {
  const { bySlug, byId, missing } = await loadCategories(db);
  if (missing.length) return { items: [], stats: emptyStats(), missingCategories: missing };
  const products = await readProducts(db);
  const existingRows = await db.catalogItemCategory.findMany();
  const existing = new Map(existingRows.map((r) => [r.productId.toString(), toAssignment(r)]));
  const productIds = new Set(products.map((p) => p.id.toString()));
  const stats = emptyStats();
  stats.products = products.length;
  stats.orphanRows = existingRows.filter((r) => !productIds.has(r.productId.toString())).length;
  const items: PlanItem[] = [];
  for (const p of products) {
    const key = p.id.toString();
    const previous = existing.get(key) ?? null;
    const override = opts.overrides?.get(key);
    let item: PlanItem;
    if (previous?.reviewStatus === "confirmed" && !override) {
      const slug = previous.categoryId ? ((byId.get(previous.categoryId)?.slug as CategorySlug | undefined) ?? null) : null;
      item = { productId: p.id, article: p.article, name: p.name ?? "", categorySlug: slug, next: previous, previous, action: "keep-confirmed" };
      stats.keptConfirmed++;
    } else {
      const { slug, next } = assignmentFor(classifyName(p.name ?? ""), bySlug, override);
      if (override) stats.overrides++;
      const action = !previous ? "create" : same(previous, next) ? "unchanged" : "update";
      item = { productId: p.id, article: p.article, name: p.name ?? "", categorySlug: slug, next, previous, action };
      stats[action]++;
    }
    if (item.next.reviewStatus === "needs_review") {
      stats.needsReview++;
      if (item.categorySlug) stats.needsReviewWithSuggestion++;
      else stats.needsReviewWithoutSuggestion++;
    } else if (item.categorySlug) {
      stats.byCategory[item.categorySlug] = (stats.byCategory[item.categorySlug] ?? 0) + 1;
    }
    items.push(item);
  }
  return { items, stats, missingCategories: [] };
}

function emptyStats(): PlanStats {
  return { products: 0, create: 0, update: 0, unchanged: 0, keptConfirmed: 0, overrides: 0, byCategory: {}, needsReview: 0, needsReviewWithSuggestion: 0, needsReviewWithoutSuggestion: 0, orphanRows: 0 };
}

const json = (a: Assignment | null) => (a ? (a as unknown as Prisma.InputJsonValue) : Prisma.JsonNull);

/** Writes the plan: only created/updated rows, each change logged under one run id. Returns the run id. */
export async function applyPlan(db: Db, items: PlanItem[], stats: PlanStats, batch = 500): Promise<string> {
  const run = await db.catalogClassificationRun.create({ data: { mode: "apply", classifierVersion: CLASSIFIER_VERSION } });
  const changed = items.filter((i) => i.action === "create" || i.action === "update");
  for (let i = 0; i < changed.length; i += batch) {
    const part = changed.slice(i, i + batch);
    await db.$transaction([
      ...part.map((it) =>
        db.catalogItemCategory.upsert({
          where: { productId: it.productId },
          create: { productId: it.productId, ...it.next, runId: run.id },
          update: { ...it.next, runId: run.id },
        }),
      ),
      db.catalogItemCategoryChange.createMany({ data: part.map((it) => ({ runId: run.id, productId: it.productId, previous: json(it.previous), next: json(it.next) })) }),
    ]);
  }
  await db.catalogClassificationRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), stats: stats as unknown as Prisma.InputJsonValue } });
  return run.id;
}

/**
 * Undoes exactly what one run wrote: rows it created are deleted, rows it updated get their previous values back.
 * Only rows still holding exactly what this run wrote are touched; a row changed afterwards (by a later run or
 * confirmed by a person) is left alone and counted as skipped.
 */
export async function rollbackRun(db: Db, runId: string): Promise<{ restored: number; deleted: number; skipped: number }> {
  const run = await db.catalogClassificationRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (run.rolledBackAt) throw new Error(`Run ${runId} was already rolled back at ${run.rolledBackAt.toISOString()}`);
  const changes = await db.catalogItemCategoryChange.findMany({ where: { runId }, orderBy: { id: "desc" } });
  let restored = 0;
  let deleted = 0;
  let skipped = 0;
  for (let i = 0; i < changes.length; i += 500) {
    const part = changes.slice(i, i + 500);
    const current = new Map((await db.catalogItemCategory.findMany({ where: { productId: { in: part.map((c) => c.productId) } } })).map((r) => [r.productId.toString(), r]));
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const ch of part) {
      const row = current.get(ch.productId.toString());
      if (!row || !same(toAssignment(row), ch.next as unknown as Assignment)) {
        skipped++;
        continue;
      }
      if (ch.previous === null) {
        ops.push(db.catalogItemCategory.delete({ where: { productId: ch.productId } }));
        deleted++;
      } else {
        const prev = ch.previous as unknown as Assignment & { runId?: string | null };
        ops.push(
          db.catalogItemCategory.update({
            where: { productId: ch.productId },
            data: { categoryId: prev.categoryId, confidence: prev.confidence, method: prev.method, reason: prev.reason, reviewStatus: prev.reviewStatus, classifierVersion: prev.classifierVersion, runId: null },
          }),
        );
        restored++;
      }
    }
    if (ops.length) await db.$transaction(ops);
  }
  await db.catalogClassificationRun.update({ where: { id: runId }, data: { rolledBackAt: new Date() } });
  await db.catalogClassificationRun.create({ data: { mode: "rollback", classifierVersion: run.classifierVersion, finishedAt: new Date(), stats: { rolledBack: runId, restored, deleted, skipped } } });
  return { restored, deleted, skipped };
}

export interface VerifyReport {
  products: number;
  rows: number;
  missing: number;
  orphans: number;
  invalidCategory: number;
  publishedWithoutCategory: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  ok: boolean;
}

/** Counts and integrity: every product has exactly one row, rows point to existing products and sections. */
export async function verifyClassification(db: Db): Promise<VerifyReport> {
  const [[counts], byStatus, byCategory] = await Promise.all([
    db.$queryRaw<{ products: bigint; rows: bigint; missing: bigint; orphans: bigint; invalid: bigint; nocat: bigint }[]>`
      SELECT
        (SELECT count(*) FROM "public"."pharmacy_products") AS products,
        (SELECT count(*) FROM "catalog_item_categories") AS rows,
        (SELECT count(*) FROM "public"."pharmacy_products" p WHERE NOT EXISTS (SELECT 1 FROM "catalog_item_categories" c WHERE c."product_id" = p."id")) AS missing,
        (SELECT count(*) FROM "catalog_item_categories" c WHERE NOT EXISTS (SELECT 1 FROM "public"."pharmacy_products" p WHERE p."id" = c."product_id")) AS orphans,
        (SELECT count(*) FROM "catalog_item_categories" c WHERE c."category_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Category" k WHERE k."id" = c."category_id")) AS invalid,
        (SELECT count(*) FROM "catalog_item_categories" c WHERE c."review_status" <> 'needs_review' AND c."category_id" IS NULL) AS nocat`,
    db.$queryRaw<{ status: string; n: bigint }[]>`SELECT "review_status" AS status, count(*) AS n FROM "catalog_item_categories" GROUP BY 1`,
    db.$queryRaw<{ slug: string; n: bigint }[]>`
      SELECT k."slug", count(*) AS n FROM "catalog_item_categories" c JOIN "Category" k ON k."id" = c."category_id"
      WHERE c."review_status" IN ('auto', 'confirmed') GROUP BY 1`,
  ]);
  const r: VerifyReport = {
    products: Number(counts.products),
    rows: Number(counts.rows),
    missing: Number(counts.missing),
    orphans: Number(counts.orphans),
    invalidCategory: Number(counts.invalid),
    publishedWithoutCategory: Number(counts.nocat),
    byStatus: Object.fromEntries(byStatus.map((x) => [x.status, Number(x.n)])),
    byCategory: Object.fromEntries(byCategory.map((x) => [x.slug, Number(x.n)])),
    ok: false,
  };
  r.ok = r.missing === 0 && r.orphans === 0 && r.invalidCategory === 0 && r.publishedWithoutCategory === 0;
  return r;
}

export const REPORT_HEADER = ["product_id", "article", "name", "category_id", "category_slug", "confidence", "method", "reason", "review_status"] as const;

export function reportRow(it: PlanItem): (string | number | null)[] {
  return [it.productId.toString(), it.article, it.name, it.next.categoryId, it.categorySlug, it.next.confidence.toFixed(2), it.next.method, it.next.reason, it.next.reviewStatus];
}
