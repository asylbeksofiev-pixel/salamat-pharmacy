import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { errorReportCsv, exportCatalogCsv } from "@/server/import/pipeline";
import { listVariants } from "@/server/catalog";
import { baseRows, cleanCatalog, csv, importCsv, iso } from "./helpers";

describe("catalogue import", () => {
  beforeEach(cleanCatalog);

  it("adds products and a repeated import creates no duplicates", async () => {
    const file = csv(baseRows());
    const first = await importCsv(file);
    expect(first.job.status).toBe("COMPLETED");
    expect(first.job.createdCount).toBe(3);
    expect(await prisma.productVariant.count()).toBe(3);
    expect(await prisma.product.count()).toBe(2); // two dosages of one product + one other product
    expect(await prisma.price.count()).toBe(4);

    const second = await importCsv(file);
    expect(second.job.createdCount).toBe(0);
    expect(second.job.skippedCount).toBe(4);
    expect(await prisma.productVariant.count()).toBe(3);
    expect(await prisma.price.count()).toBe(4);
  });

  it("matches by salamat_sku and barcode when external_id is absent, and updates in place", async () => {
    await importCsv(csv(baseRows()));
    const update = csv([{ salamat_sku: "TS-1", product_name: "Тестофен", full_variant_name: "Тестофен 200 мг №10 табл.", pharmacy_code: "SAL-01", price_kzt: 350, stock_quantity: 8, updated_at: iso(0.5) }]);
    const res = await importCsv(update, { source: "other-src" });
    expect(res.job.updatedCount).toBe(1);
    expect(await prisma.productVariant.count()).toBe(3);
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { salamatSku: "TS-1" }, include: { prices: { include: { pharmacy: true } } } });
    expect(v.prices.find((p) => p.pharmacy.code === "SAL-01")?.priceKzt).toBe(350);
  });

  it("puts invalid rows into the error report and rejects them", async () => {
    const rows = [...baseRows(), { external_id: "BAD-1", product_name: "Плохая", full_variant_name: "Плохая цена", pharmacy_code: "SAL-01", price_kzt: "abc", updated_at: iso(1) }, { external_id: "BAD-2", product_name: "Нет аптеки", full_variant_name: "Нет аптеки 1 мг", pharmacy_code: "SAL-99", price_kzt: 100, updated_at: iso(1) }];
    const { jobId, job } = await importCsv(csv(rows));
    expect(job.rejectedCount).toBe(2);
    expect(await prisma.productVariant.count()).toBe(3);
    const report = await errorReportCsv(jobId);
    expect(report).toContain("INVALID_PRICE");
    expect(report).toContain("UNKNOWN_PHARMACY");
    expect(report).toMatch(/^﻿row_number,severity,column,code,message,raw_value/);
  });

  it("fails the job when required columns are missing", async () => {
    const { job } = await importCsv(Buffer.from("name,price\nX,1\n"));
    expect(job.status).toBe("FAILED");
    expect(job.errorMessage).toContain("product_name");
  });

  it("keeps new products as drafts (not public) unless publishing was requested", async () => {
    await importCsv(csv(baseRows()));
    expect(await prisma.product.count({ where: { publicationStatus: "DRAFT" } })).toBe(2);
    const listing = await listVariants({ locale: "ru", pharmacyId: null, filters: {} });
    expect(listing.total).toBe(0);
  });

  it("does not delete products missing from a later file", async () => {
    await importCsv(csv(baseRows()));
    await importCsv(csv(baseRows().slice(0, 1)));
    expect(await prisma.productVariant.count()).toBe(3);
  });

  it("exports the catalogue in the import format", async () => {
    await importCsv(csv(baseRows()));
    const out = await exportCatalogCsv();
    expect(out.split("\r\n")[0]).toContain("external_id,salamat_sku,barcode,product_name,full_variant_name");
    expect(out).toContain("Тестофен 400 мг №10 табл.");
  });
});
