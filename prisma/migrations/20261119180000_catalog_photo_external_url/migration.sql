-- Photos published as direct links to the source (Open Facts image servers) instead of a copy in Vercel Blob.
-- Only catalog_photo_results changes (new nullable columns, a new check); public.pharmacy_products is not touched.
-- storage: 'vercel_blob' — a copy in SALAMAT's Blob store (URL in stored_image_url);
--          'external_url' — the source's own public HTTPS URL, nothing copied (stored_image_url stays empty).
-- published_image_url is exactly what was written into pharmacy_products.image_url.

-- AlterTable
ALTER TABLE "catalog_photo_results" ADD COLUMN     "published_image_url" TEXT,
ADD COLUMN     "source_bytes" INTEGER,
ADD COLUMN     "source_checked_at" TIMESTAMP(3),
ADD COLUMN     "source_sha256" TEXT,
ADD COLUMN     "storage" TEXT;

-- Rows published before this migration were Blob copies.
UPDATE "catalog_photo_results"
SET "storage" = 'vercel_blob', "published_image_url" = "stored_image_url"
WHERE "review_status" = 'published' AND "storage" IS NULL;

ALTER TABLE "catalog_photo_results"
  ADD CONSTRAINT "catalog_photo_results_storage_check" CHECK ("storage" IS NULL OR "storage" IN ('vercel_blob', 'external_url')),
  DROP CONSTRAINT "catalog_photo_results_published_check",
  -- A published row names how the photo is served, and a source URL is never presented as a Blob copy.
  -- "IS TRUE": a missing value (NULL) must fail the check instead of passing it.
  ADD CONSTRAINT "catalog_photo_results_published_check" CHECK (
    "review_status" <> 'published' OR (
      "published_image_url" LIKE 'https://%' AND "sha256" IS NOT NULL
      AND "match_status" IN ('confirmed', 'probable')
      AND "rights_status" IN ('licensed_cc_by_sa', 'permission_granted')
      AND (
        ("storage" = 'vercel_blob' AND "stored_image_url" LIKE 'https://%' AND "published_image_url" = "stored_image_url")
        OR ("storage" = 'external_url' AND "stored_image_url" IS NULL AND "published_image_url" = "source_image_url"
            AND "source_page_url" LIKE 'https://%' AND "source_license" IS NOT NULL AND "attribution" IS NOT NULL)
      )) IS TRUE);
