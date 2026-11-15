import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { slugify } from "@/lib/slug";
import { buildSearchText, normalizeSearchText } from "@/lib/search-normalize";
import { validateRecords, type NormalizedRow, type RowIssue } from "./validate";
import type { DataProvider } from "./providers";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface PreviewResult {
  jobId: string;
  missingColumns: string[];
}

/** Matching order (docs/data-import.md): external_id within the source → salamat_sku → barcode. */
interface Match {
  variantId: string;
  rule: "external_id" | "salamat_sku" | "barcode";
}

function identityOf(r: NormalizedRow): string {
  return r.externalId ? `ext:${r.externalId}` : r.salamatSku ? `sku:${r.salamatSku}` : `bar:${r.barcode}`;
}

async function ensureSource(code: string, name: string, kind: "FILE_IMPORT" | "API" | "DEMO", isDemo: boolean) {
  return prisma.dataSource.upsert({
    where: { code },
    create: { code, name, kind, isDemo, verifiedAt: new Date() },
    update: { verifiedAt: new Date() },
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function findMatches(rows: NormalizedRow[], sourceId: string) {
  const ext = Array.from(new Set(rows.map((r) => r.externalId).filter((x): x is string => !!x)));
  const skus = Array.from(new Set(rows.map((r) => r.salamatSku).filter((x): x is string => !!x)));
  const bars = Array.from(new Set(rows.map((r) => r.barcode).filter((x): x is string => !!x)));
  const byExt = new Map<string, string>();
  const bySku = new Map<string, string>();
  const byBar = new Map<string, string[]>();
  for (const part of chunk(ext, 5000)) {
    for (const v of await prisma.productVariant.findMany({ where: { sourceId, externalId: { in: part } }, select: { id: true, externalId: true } }))
      byExt.set(v.externalId!, v.id);
  }
  for (const part of chunk(skus, 5000)) {
    for (const v of await prisma.productVariant.findMany({ where: { salamatSku: { in: part } }, select: { id: true, salamatSku: true } }))
      bySku.set(v.salamatSku!, v.id);
  }
  for (const part of chunk(bars, 5000)) {
    for (const v of await prisma.productVariant.findMany({ where: { barcode: { in: part } }, select: { id: true, barcode: true } }))
      byBar.set(v.barcode!, [...(byBar.get(v.barcode!) ?? []), v.id]);
  }
  return { byExt, bySku, byBar };
}

function matchRow(r: NormalizedRow, m: Awaited<ReturnType<typeof findMatches>>): Match | "ambiguous" | null {
  if (r.externalId && m.byExt.has(r.externalId)) return { variantId: m.byExt.get(r.externalId)!, rule: "external_id" };
  if (r.salamatSku && m.bySku.has(r.salamatSku)) return { variantId: m.bySku.get(r.salamatSku)!, rule: "salamat_sku" };
  if (r.barcode && m.byBar.has(r.barcode)) {
    const ids = m.byBar.get(r.barcode)!;
    return ids.length === 1 ? { variantId: ids[0], rule: "barcode" } : "ambiguous";
  }
  return null;
}

/** Validates, matches and stores a preview. Nothing in the catalogue changes until applyImport. */
export async function createImportPreview(args: {
  provider: DataProvider;
  fileName: string;
  publishNew: boolean;
  adminUserId: string | null;
  isDemo?: boolean;
}): Promise<PreviewResult> {
  const { headers, records, truncated } = await args.provider.fetchRecords();
  const pharmacies = await prisma.pharmacy.findMany({ select: { id: true, code: true } });
  const codeToId = new Map(pharmacies.map((p) => [p.code, p.id]));
  const v = validateRecords(records, { knownPharmacyCodes: new Set(codeToId.keys()), headerRow: headers });
  const source = await ensureSource(args.provider.code, args.provider.name, args.isDemo ? "DEMO" : args.provider.kind, !!args.isDemo);

  const job = await prisma.importJob.create({
    data: {
      fileName: args.fileName.slice(0, 200),
      fileType: args.fileName.toLowerCase().endsWith(".xlsx") ? "xlsx" : args.provider.kind === "API" ? "api" : "csv",
      sourceId: source.id,
      createdById: args.adminUserId,
      publishNew: args.publishNew,
      totalRows: records.length,
      status: v.missingColumns.length ? "FAILED" : "PREVIEW",
      errorMessage: v.missingColumns.length
        ? `Нет обязательных колонок: ${v.missingColumns.join(", ")}`
        : truncated
          ? "Файл обрезан до 50 000 строк — остальные строки не загружены"
          : null,
    },
  });
  if (v.missingColumns.length) return { jobId: job.id, missingColumns: v.missingColumns };

  const issues: RowIssue[] = [...v.issues];
  if (v.unknownColumns.length)
    issues.push({ rowNumber: 1, column: v.unknownColumns.join(", "), code: "UNKNOWN_COLUMNS", message: "Колонки не распознаны и будут пропущены", rawValue: null, severity: "WARNING" });

  const matches = await findMatches(v.rows, source.id);
  // Existing price/stock for change detection.
  const matchedIds = new Set<string>();
  const rowMatch = new Map<number, Match | null>();
  for (const r of v.rows) {
    const m = matchRow(r, matches);
    if (m === "ambiguous") {
      issues.push({ rowNumber: r.rowNumber, column: "barcode", code: "AMBIGUOUS_BARCODE", message: "Штрихкод совпадает с несколькими вариантами — укажите external_id или salamat_sku", rawValue: r.barcode, severity: "ERROR" });
      v.rejected.add(r.rowNumber);
      continue;
    }
    rowMatch.set(r.rowNumber, m);
    if (m) matchedIds.add(m.variantId);
  }
  const existing = new Map<string, Awaited<ReturnType<typeof loadExisting>>[number]>();
  for (const part of chunk([...matchedIds], 2000)) for (const e of await loadExisting(part)) existing.set(e.id, e);

  const seenNew = new Set<string>();
  const plannedRows: Prisma.ImportRowCreateManyInput[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of v.rows) {
    if (v.rejected.has(r.rowNumber)) continue;
    const m = rowMatch.get(r.rowNumber) ?? null;
    let action: "CREATE" | "UPDATE" | "SKIP";
    if (!m) {
      const id = identityOf(r);
      action = seenNew.has(id) ? "UPDATE" : "CREATE";
      seenNew.add(id);
    } else {
      action = hasChanges(r, existing.get(m.variantId), codeToId) ? "UPDATE" : "SKIP";
    }
    if (action === "CREATE") created++;
    else if (action === "UPDATE") updated++;
    else skipped++;
    plannedRows.push({
      jobId: job.id,
      rowNumber: r.rowNumber,
      data: r as unknown as Prisma.InputJsonValue,
      plannedAction: action,
      matchedVariantId: m?.variantId ?? null,
      matchRule: m?.rule ?? null,
    });
  }
  for (const part of chunk(plannedRows, 2000)) await prisma.importRow.createMany({ data: part });
  for (const part of chunk(issues, 2000))
    await prisma.importError.createMany({
      data: part.map((i) => ({ jobId: job.id, rowNumber: i.rowNumber, column: i.column, code: i.code, message: i.message, rawValue: i.rawValue?.slice(0, 200) ?? null, severity: i.severity })),
    });
  const rejectedRows = new Set([...v.rejected]);
  await prisma.importJob.update({
    where: { id: job.id },
    data: { createdCount: created, updatedCount: updated, skippedCount: skipped, rejectedCount: rejectedRows.size },
  });
  return { jobId: job.id, missingColumns: [] };
}

async function loadExisting(ids: string[]) {
  return prisma.productVariant.findMany({
    where: { id: { in: ids } },
    include: { prices: true, inventories: true, product: { include: { brand: true } } },
  });
}

function hasChanges(
  r: NormalizedRow,
  e: Awaited<ReturnType<typeof loadExisting>>[number] | undefined,
  codeToId: Map<string, string>,
): boolean {
  if (!e) return true;
  if (
    e.fullName !== r.fullName ||
    (r.dosage && e.dosage !== r.dosage) ||
    (r.form && e.form !== r.form) ||
    (r.volume && e.volume !== r.volume) ||
    (r.packageSize && e.packageSize !== r.packageSize) ||
    (r.prescriptionStatus !== "UNKNOWN" && e.prescriptionStatus !== r.prescriptionStatus) ||
    (r.imageUrl && e.imageUrl !== r.imageUrl) ||
    (r.barcode && !e.barcode) ||
    (r.salamatSku && !e.salamatSku)
  )
    return true;
  if (r.pharmacyCode) {
    const pid = codeToId.get(r.pharmacyCode);
    const p = e.prices.find((x) => x.pharmacyId === pid);
    const i = e.inventories.find((x) => x.pharmacyId === pid);
    if (r.priceKzt !== null && (!p || p.priceKzt !== r.priceKzt || (p.oldPriceKzt ?? null) !== r.oldPriceKzt)) return true;
    if (r.priceKzt !== null && r.updatedAt && p && p.sourceUpdatedAt.toISOString() !== r.updatedAt) return true;
    if (r.stockQuantity !== null && (!i || i.quantity !== r.stockQuantity)) return true;
    if (r.stockStatus && (!i || i.status !== r.stockStatus)) return true;
    if (r.stockQuantity !== null && r.updatedAt && i && i.sourceUpdatedAt.toISOString() !== r.updatedAt) return true;
  }
  return false;
}

// ---------- apply ----------

class Caches {
  brands = new Map<string, string>();
  categories = new Map<string, string>();
  products = new Map<string, string>();
}

async function uniqueSlug(tx: Tx, model: "product" | "productVariant", base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const exists =
      model === "product"
        ? await tx.product.findUnique({ where: { slug }, select: { id: true } })
        : await tx.productVariant.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function brandId(tx: Tx, c: Caches, name: string | null): Promise<string | null> {
  if (!name) return null;
  const key = name.toLowerCase();
  if (c.brands.has(key)) return c.brands.get(key)!;
  const found = await tx.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  let id = found?.id;
  if (!id) {
    let slug = slugify(name);
    if (await tx.brand.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
    id = (await tx.brand.create({ data: { name, slug } })).id;
  }
  c.brands.set(key, id);
  return id;
}

async function categoryId(tx: Tx, c: Caches, path: string[]): Promise<string | null> {
  if (!path.length) return null;
  let parentId: string | null = null;
  let key = "";
  for (const name of path) {
    key += `>${name.toLowerCase()}`;
    if (c.categories.has(key)) {
      parentId = c.categories.get(key)!;
      continue;
    }
    const found: { id: string } | null = await tx.category.findFirst({
      where: { parentId, nameRu: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    let id: string | undefined = found?.id;
    if (!id) {
      let slug = slugify(name);
      if (await tx.category.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
      const createdCat: { id: string } = await tx.category.create({ data: { nameRu: name, slug, parentId, sortOrder: 100 }, select: { id: true } });
      id = createdCat.id;
    }
    c.categories.set(key, id);
    parentId = id;
  }
  return parentId;
}

async function productFor(tx: Tx, c: Caches, r: NormalizedRow, publishNew: boolean): Promise<{ id: string; created: boolean }> {
  const bId = await brandId(tx, c, r.brand);
  const key = `${normalizeSearchText(r.productName)}|${bId ?? ""}`;
  if (c.products.has(key)) return { id: c.products.get(key)!, created: false };
  const found = await tx.product.findFirst({ where: { name: { equals: r.productName, mode: "insensitive" }, brandId: bId } });
  if (found) {
    c.products.set(key, found.id);
    return { id: found.id, created: false };
  }
  const catId = await categoryId(tx, c, r.categoryPath);
  const slug = await uniqueSlug(tx, "product", slugify(r.brand ? `${r.productName} ${r.brand}` : r.productName));
  const p = await tx.product.create({
    data: {
      name: r.productName,
      nameKk: r.productNameKk,
      slug,
      brandId: bId,
      manufacturer: r.manufacturer,
      categoryId: catId,
      publicationStatus: publishNew ? "PUBLISHED" : "DRAFT",
      searchAliases: r.searchAliases,
    },
  });
  c.products.set(key, p.id);
  return { id: p.id, created: true };
}

export async function refreshSearchText(tx: Tx, variantId: string) {
  const v = await tx.productVariant.findUnique({ where: { id: variantId }, include: { product: { include: { brand: true } } } });
  if (!v) return;
  const text = buildSearchText([
    v.product.name,
    v.product.nameKk,
    v.fullName,
    v.product.brand?.name,
    v.product.manufacturer,
    v.dosage,
    v.form,
    v.volume,
    v.packageSize,
    v.product.searchAliases,
    v.barcode,
    v.salamatSku,
  ]);
  if (text !== v.searchText) await tx.productVariant.update({ where: { id: variantId }, data: { searchText: text } });
}

export async function refreshProductSearchText(tx: Tx, productId: string) {
  const ids = await tx.productVariant.findMany({ where: { productId }, select: { id: true } });
  for (const { id } of ids) await refreshSearchText(tx, id);
}

async function applyRow(
  tx: Tx,
  c: Caches,
  r: NormalizedRow,
  matchedVariantId: string | null,
  ctx: { sourceId: string; publishNew: boolean; codeToId: Map<string, string>; now: Date; createdByIdentity: Map<string, string> },
): Promise<{ variantId: string; created: boolean }> {
  let variantId = matchedVariantId ?? ctx.createdByIdentity.get(identityOf(r)) ?? null;
  let created = false;
  if (!variantId) {
    const product = await productFor(tx, c, r, ctx.publishNew);
    const slug = await uniqueSlug(tx, "productVariant", slugify(r.fullName));
    const v = await tx.productVariant.create({
      data: {
        productId: product.id,
        sourceId: ctx.sourceId,
        externalId: r.externalId,
        salamatSku: r.salamatSku,
        barcode: r.barcode,
        fullName: r.fullName,
        slug,
        dosage: r.dosage,
        form: r.form,
        volume: r.volume,
        packageSize: r.packageSize,
        packageQuantity: r.packageQuantity,
        prescriptionStatus: r.prescriptionStatus,
        imageUrl: r.imageUrl,
        lastVerifiedAt: ctx.now,
      },
    });
    variantId = v.id;
    created = true;
    ctx.createdByIdentity.set(identityOf(r), v.id);
  } else {
    const e = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (e) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          fullName: r.fullName,
          dosage: r.dosage ?? e.dosage,
          form: r.form ?? e.form,
          volume: r.volume ?? e.volume,
          packageSize: r.packageSize ?? e.packageSize,
          packageQuantity: r.packageQuantity ?? e.packageQuantity,
          prescriptionStatus: r.prescriptionStatus !== "UNKNOWN" ? r.prescriptionStatus : e.prescriptionStatus,
          imageUrl: r.imageUrl ?? e.imageUrl,
          barcode: e.barcode ?? r.barcode,
          salamatSku: e.salamatSku ?? r.salamatSku,
          externalId: e.externalId ?? (e.sourceId === ctx.sourceId ? r.externalId : e.externalId),
          lastVerifiedAt: ctx.now,
        },
      });
    }
  }

  if (r.pharmacyCode) {
    const pharmacyId = ctx.codeToId.get(r.pharmacyCode)!;
    const stamp = r.updatedAt ? new Date(r.updatedAt) : ctx.now;
    if (r.priceKzt !== null) {
      await tx.price.upsert({
        where: { variantId_pharmacyId: { variantId, pharmacyId } },
        create: { variantId, pharmacyId, priceKzt: r.priceKzt, oldPriceKzt: r.oldPriceKzt, sourceId: ctx.sourceId, sourceUpdatedAt: stamp },
        update: { priceKzt: r.priceKzt, oldPriceKzt: r.oldPriceKzt, sourceId: ctx.sourceId, sourceUpdatedAt: stamp },
      });
    }
    if (r.stockQuantity !== null || r.stockStatus) {
      const status = r.stockStatus ?? (r.stockQuantity! > 0 ? "IN_STOCK" : "OUT_OF_STOCK");
      await tx.inventory.upsert({
        where: { variantId_pharmacyId: { variantId, pharmacyId } },
        create: { variantId, pharmacyId, status, quantity: r.stockQuantity, sourceId: ctx.sourceId, sourceUpdatedAt: stamp },
        update: { status, quantity: r.stockQuantity, sourceId: ctx.sourceId, sourceUpdatedAt: stamp },
      });
    }
  }
  await refreshSearchText(tx, variantId);
  return { variantId, created };
}

/**
 * Applies a preview. Existing products are never deleted or unpublished because they are missing from the file.
 * New products stay DRAFT unless the job was started with publishNew.
 */
export async function applyImport(jobId: string, adminUserId: string | null): Promise<void> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "PREVIEW") throw new Error("Импорт уже применён или недоступен");
  const locked = await prisma.importJob.updateMany({ where: { id: jobId, status: "PREVIEW" }, data: { status: "APPLYING" } });
  if (locked.count === 0) throw new Error("Импорт уже выполняется");

  const pharmacies = await prisma.pharmacy.findMany({ select: { id: true, code: true } });
  const ctx = {
    sourceId: job.sourceId,
    publishNew: job.publishNew,
    codeToId: new Map(pharmacies.map((p) => [p.code, p.id])),
    now: new Date(),
    createdByIdentity: new Map<string, string>(),
  };
  const caches = new Caches();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  try {
    let cursor = 0;
    for (;;) {
      const rows = await prisma.importRow.findMany({
        where: { jobId, rowNumber: { gt: cursor } },
        orderBy: { rowNumber: "asc" },
        take: 200,
      });
      if (!rows.length) break;
      await prisma.$transaction(
        async (tx) => {
          for (const row of rows) {
            if (row.plannedAction === "SKIP") {
              skipped++;
              await tx.importRow.update({ where: { id: row.id }, data: { resultAction: "SKIP" } });
              continue;
            }
            const data = row.data as unknown as NormalizedRow;
            const res = await applyRow(tx, caches, data, row.matchedVariantId, ctx);
            if (res.created) created++;
            else updated++;
            await tx.importRow.update({
              where: { id: row.id },
              data: { resultAction: res.created ? "CREATE" : "UPDATE", matchedVariantId: res.variantId },
            });
          }
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
      cursor = rows[rows.length - 1].rowNumber;
    }
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", appliedAt: new Date(), createdCount: created, updatedCount: updated, skippedCount: skipped },
    });
    await audit(adminUserId, "import.apply", "ImportJob", jobId, `Импорт «${job.fileName}»: добавлено ${created}, изменено ${updated}, пропущено ${skipped}, отклонено ${job.rejectedCount}`);
  } catch (e) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: `Ошибка применения: ${(e as Error).message}`.slice(0, 500), createdCount: created, updatedCount: updated, skippedCount: skipped },
    });
    throw e;
  }
}

/** Products created by a job that are still drafts — for the "publish after review" action. */
export async function draftProductsOfJob(jobId: string): Promise<string[]> {
  const rows = await prisma.importRow.findMany({
    where: { jobId, resultAction: "CREATE", matchedVariantId: { not: null } },
    select: { matchedVariantId: true },
  });
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: rows.map((r) => r.matchedVariantId!) }, product: { publicationStatus: "DRAFT" } },
    select: { productId: true },
  });
  return Array.from(new Set(variants.map((v) => v.productId)));
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Prevent formula injection when the report is opened in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function errorReportCsv(jobId: string): Promise<string> {
  const errors = await prisma.importError.findMany({ where: { jobId }, orderBy: [{ rowNumber: "asc" }] });
  return toCsv(
    ["row_number", "severity", "column", "code", "message", "raw_value"],
    errors.map((e) => [e.rowNumber, e.severity, e.column, e.code, e.message, e.rawValue]),
  );
}

/** Exports the catalogue in the import template format (one row per SKU × pharmacy). */
export async function exportCatalogCsv(): Promise<string> {
  const variants = await prisma.productVariant.findMany({
    include: {
      product: { include: { brand: true, category: { include: { parent: { include: { parent: true } } } } } },
      source: true,
      prices: { include: { pharmacy: true } },
      inventories: { include: { pharmacy: true } },
    },
    orderBy: { fullName: "asc" },
  });
  const header = ["external_id", "salamat_sku", "barcode", "product_name", "full_variant_name", "category_path", "brand", "manufacturer", "dosage", "form", "package_size", "volume", "prescription_status", "pharmacy_code", "price_kzt", "stock_quantity", "image_url", "source_name", "updated_at", "old_price_kzt", "stock_status"];
  const rows: unknown[][] = [];
  for (const v of variants) {
    const cat = v.product.category;
    const path = [cat?.parent?.parent?.nameRu, cat?.parent?.nameRu, cat?.nameRu].filter(Boolean).join(" > ");
    const rx = v.prescriptionStatus === "PRESCRIPTION" ? "rx" : v.prescriptionStatus === "NON_PRESCRIPTION" ? "otc" : "";
    const base = [v.externalId, v.salamatSku, v.barcode, v.product.name, v.fullName, path, v.product.brand?.name, v.product.manufacturer, v.dosage, v.form, v.packageSize, v.volume, rx];
    const codes = new Set([...v.prices.map((p) => p.pharmacy.code), ...v.inventories.map((i) => i.pharmacy.code)]);
    if (!codes.size) rows.push([...base, "", "", "", v.imageUrl, v.source?.name, "", "", ""]);
    for (const code of codes) {
      const p = v.prices.find((x) => x.pharmacy.code === code);
      const i = v.inventories.find((x) => x.pharmacy.code === code);
      const stamp = [p?.sourceUpdatedAt, i?.sourceUpdatedAt].filter(Boolean).sort().pop();
      rows.push([...base, code, p?.priceKzt, i?.quantity, v.imageUrl, v.source?.name, (stamp as Date | undefined)?.toISOString(), p?.oldPriceKzt, i?.status]);
    }
  }
  return toCsv(header, rows);
}

export { ensureSource };
