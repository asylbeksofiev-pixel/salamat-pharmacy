-- Photo search for catalogue products without a photo (scripts/catalog-photos/internet.ts, docs/catalog-photos-internet.md).
-- Schema only: two new tables. public.pharmacy_products is not changed here; image_url is filled later, one product at a
-- time, by `npm run photos:publish -- --confirm`, and only where it is empty. Image files live in Vercel Blob, never here.
-- No foreign key to pharmacy_products: that table is created by the catalogue import, outside Prisma migrations.

-- CreateTable
CREATE TABLE "catalog_photo_results" (
    "product_id" BIGINT NOT NULL,
    "article" TEXT,
    "product_name" TEXT NOT NULL,
    "match_status" TEXT NOT NULL,
    "match_method" TEXT NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "source_name" TEXT,
    "source_page_url" TEXT,
    "source_image_url" TEXT,
    "stored_image_url" TEXT,
    "source_license" TEXT,
    "rights_status" TEXT NOT NULL,
    "attribution" TEXT,
    "manufacturer" TEXT,
    "detected_gtin" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "file_size" INTEGER,
    "sha256" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'auto',
    "reason" TEXT,
    "error" TEXT,
    "run_id" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_photo_results_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "catalog_photo_changes" (
    "id" BIGSERIAL NOT NULL,
    "run_id" TEXT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "previous_image_url" TEXT,
    "new_image_url" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverted_at" TIMESTAMP(3),

    CONSTRAINT "catalog_photo_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_photo_results_match_status_review_status_idx" ON "catalog_photo_results"("match_status", "review_status");

-- CreateIndex
CREATE INDEX "catalog_photo_results_run_id_idx" ON "catalog_photo_results"("run_id");

-- CreateIndex
CREATE INDEX "catalog_photo_results_sha256_idx" ON "catalog_photo_results"("sha256");

-- CreateIndex
CREATE INDEX "catalog_photo_changes_run_id_idx" ON "catalog_photo_changes"("run_id");

-- CreateIndex
CREATE INDEX "catalog_photo_changes_product_id_idx" ON "catalog_photo_changes"("product_id");



-- Guard the values the publication and the site rely on.
ALTER TABLE "catalog_photo_results"
  ADD CONSTRAINT "catalog_photo_results_match_status_check" CHECK ("match_status" IN ('confirmed', 'probable', 'doubtful', 'no_match')),
  ADD CONSTRAINT "catalog_photo_results_review_status_check" CHECK ("review_status" IN ('auto', 'approved', 'rejected', 'published', 'rolled_back')),
  ADD CONSTRAINT "catalog_photo_results_rights_status_check" CHECK ("rights_status" IN ('licensed_cc_by_sa', 'permission_granted', 'permission_required', 'not_applicable')),
  ADD CONSTRAINT "catalog_photo_results_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  -- Only a reviewed or confirmed match with a reusable licence and a stored file can be published.
  ADD CONSTRAINT "catalog_photo_results_published_check" CHECK (
    "review_status" <> 'published' OR (
      "stored_image_url" LIKE 'https://%' AND "sha256" IS NOT NULL
      AND "match_status" IN ('confirmed', 'probable')
      AND "rights_status" IN ('licensed_cc_by_sa', 'permission_granted')));
