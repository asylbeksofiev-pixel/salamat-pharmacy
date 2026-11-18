-- Product photos are bound to the unique product id instead of the barcode.
-- pharmacy_products.article is not unique (13 347 rows, equal articles on different products), so a barcode key could show
-- one product's photo on another. Only URLs and small metadata are stored here; image files live in Vercel Blob.
-- public.pharmacy_products is only read (to carry over rows whose barcode belongs to exactly one product).

ALTER TABLE "catalog_images"
  ADD COLUMN "product_id" BIGINT,
  ADD COLUMN "attribution" TEXT,
  ADD COLUMN "review_status" TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN "match_method" TEXT,
  ADD COLUMN "confidence" REAL,
  ADD COLUMN "image_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "image_sha256" TEXT,
  ADD COLUMN "image_width" INTEGER,
  ADD COLUMN "image_height" INTEGER,
  ADD COLUMN "checked_at" TIMESTAMP(3);

-- Existing barcode rows: keep those whose barcode identifies exactly one product. They were matched by barcode only,
-- without checking strength/form/pack, so they stay hidden ('needs_review') until reviewed and republished.
DO $$
BEGIN
  IF to_regclass('public.pharmacy_products') IS NOT NULL THEN
    UPDATE "catalog_images" ci
    SET "product_id" = m.id, "match_method" = 'barcode_legacy'
    FROM (
      SELECT btrim(article) AS article, min(id) AS id
      FROM public.pharmacy_products
      WHERE coalesce(btrim(article), '') <> ''
      GROUP BY btrim(article)
      HAVING count(*) = 1
    ) m
    WHERE m.article = ci."barcode";
  END IF;
  -- Rows that cannot be tied to a single product are set aside, not lost.
  IF EXISTS (SELECT 1 FROM "catalog_images" WHERE "product_id" IS NULL) THEN
    CREATE TABLE IF NOT EXISTS "catalog_images_unmapped" AS SELECT * FROM "catalog_images" WHERE false;
    INSERT INTO "catalog_images_unmapped" SELECT * FROM "catalog_images" WHERE "product_id" IS NULL;
    DELETE FROM "catalog_images" WHERE "product_id" IS NULL;
  END IF;
END $$;

ALTER TABLE "catalog_images" DROP CONSTRAINT "catalog_images_pkey";
ALTER TABLE "catalog_images" ALTER COLUMN "barcode" DROP NOT NULL;
ALTER TABLE "catalog_images" ALTER COLUMN "product_id" SET NOT NULL;
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_pkey" PRIMARY KEY ("product_id");
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_review_status_check"
  CHECK ("review_status" IN ('approved', 'needs_review', 'rejected'));
CREATE INDEX "catalog_images_barcode_idx" ON "catalog_images"("barcode");
