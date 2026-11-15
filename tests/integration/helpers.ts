import { prisma } from "@/server/db";
import { FileDataProvider } from "@/server/import/providers";
import { applyImport, createImportPreview } from "@/server/import/pipeline";

export async function cleanCatalog() {
  await prisma.$executeRawUnsafe(`TRUNCATE "OrderItem", "OrderEvent", "OrderNote", "Order", "PromotionVariant", "PromotionCategory", "PromotionPharmacy", "Promotion", "Price", "Inventory", "ProductVariant", "Product", "Brand", "ImportError", "ImportRow", "ImportJob", "RateLimitBucket", "AuditLog" CASCADE`);
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.dataSource.deleteMany({ where: { code: { notIn: ["salamatfarmacia-kz", "manual"] } } });
}

export function csv(rows: Record<string, string | number>[]): Buffer {
  const header = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [header.join(","), ...rows.map((r) => header.map((h) => String(r[h] ?? "")).join(","))];
  return Buffer.from(lines.join("\n"), "utf8");
}

export async function importCsv(buf: Buffer, opts: { publishNew?: boolean; source?: string } = {}) {
  const provider = new FileDataProvider(opts.source ?? "test-src", "Тестовый источник", "test.csv", buf);
  const { jobId, missingColumns } = await createImportPreview({ provider, fileName: "test.csv", publishNew: opts.publishNew ?? false, adminUserId: null });
  if (missingColumns.length) return { jobId, job: await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } }) };
  await applyImport(jobId, null);
  return { jobId, job: await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } }) };
}

export const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

/** Two SKUs of one product (different dosages) with stock in SAL-01/SAL-02, one prescription SKU. */
export function baseRows() {
  const common = { product_name: "Тестофен", brand: "Тест Бренд", category_path: "Лекарственные средства > Тестовые", form: "таблетки", prescription_status: "otc" };
  return [
    { ...common, external_id: "T-1", salamat_sku: "TS-1", full_variant_name: "Тестофен 200 мг №10 табл.", dosage: "200 мг", package_size: "№10", pharmacy_code: "SAL-01", price_kzt: 300, stock_quantity: 10, updated_at: iso(1) },
    { ...common, external_id: "T-1", salamat_sku: "TS-1", full_variant_name: "Тестофен 200 мг №10 табл.", dosage: "200 мг", package_size: "№10", pharmacy_code: "SAL-02", price_kzt: 320, stock_quantity: 4, updated_at: iso(1) },
    { ...common, external_id: "T-2", salamat_sku: "TS-2", full_variant_name: "Тестофен 400 мг №10 табл.", dosage: "400 мг", package_size: "№10", pharmacy_code: "SAL-01", price_kzt: 500, stock_quantity: 0, updated_at: iso(1) },
    { ...common, external_id: "T-3", salamat_sku: "TS-3", product_name: "Рецептин", full_variant_name: "Рецептин 50 мг №30 табл.", prescription_status: "rx", pharmacy_code: "SAL-01", price_kzt: 2000, stock_quantity: 5, updated_at: iso(1) },
  ];
}
