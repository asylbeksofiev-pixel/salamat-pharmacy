-- Sections of catalogue products (public.pharmacy_products), one row per unique product id.
-- Schema only: new tables, indexes and checks. public.pharmacy_products and "Category" rows are not changed;
-- assignments are written later by `npm run catalog:classify -- --apply` (see docs/catalog-categories.md).
-- No foreign key to pharmacy_products: that table is created by the catalogue import, outside Prisma migrations;
-- the script's --verify step reports rows without a product.

-- CreateTable
CREATE TABLE "catalog_item_categories" (
    "product_id" BIGINT NOT NULL,
    "category_id" TEXT,
    "confidence" DECIMAL(3,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "review_status" TEXT NOT NULL,
    "classifier_version" TEXT NOT NULL,
    "run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_item_categories_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "catalog_classification_runs" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "classifier_version" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),
    "stats" JSONB,

    CONSTRAINT "catalog_classification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_item_category_changes" (
    "id" BIGSERIAL NOT NULL,
    "run_id" TEXT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "previous" JSONB,
    "next" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_item_category_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalog_item_categories_category_id_review_status_idx" ON "catalog_item_categories"("category_id", "review_status");

-- CreateIndex
CREATE INDEX "catalog_item_categories_review_status_idx" ON "catalog_item_categories"("review_status");

-- CreateIndex
CREATE INDEX "catalog_item_categories_run_id_idx" ON "catalog_item_categories"("run_id");

-- CreateIndex
CREATE INDEX "catalog_item_category_changes_run_id_idx" ON "catalog_item_category_changes"("run_id");

-- CreateIndex
CREATE INDEX "catalog_item_category_changes_product_id_idx" ON "catalog_item_category_changes"("product_id");

-- AddForeignKey
ALTER TABLE "catalog_item_categories" ADD CONSTRAINT "catalog_item_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_item_category_changes" ADD CONSTRAINT "catalog_item_category_changes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "catalog_classification_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Guard the values the site relies on.
ALTER TABLE "catalog_item_categories"
  ADD CONSTRAINT "catalog_item_categories_review_status_check" CHECK ("review_status" IN ('auto', 'needs_review', 'confirmed')),
  ADD CONSTRAINT "catalog_item_categories_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  ADD CONSTRAINT "catalog_item_categories_published_has_category_check" CHECK ("review_status" = 'needs_review' OR "category_id" IS NOT NULL);
