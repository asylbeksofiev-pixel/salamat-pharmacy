-- SALAMAT · Open Facts photos as direct links · step 4 of 5: apply. One transaction: all or nothing.
-- Fills public.pharmacy_products.image_url with the source's own HTTPS URL, only where it is empty, only when id,
-- article and name match the CSV. Every change goes to catalog_photo_changes (run_id below) for rollback; the
-- source, authors and licence go to catalog_photo_results (storage = 'external_url'; stored_image_url stays empty —
-- nothing was copied to Vercel Blob). Name, article, price and other columns are never changed.
-- Run:  \i 'C:/salamat/04_apply_import.sql'

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.catalog_photo_results') IS NULL OR to_regclass('public.catalog_photo_changes') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'catalog_photo_results' AND column_name = 'storage') THEN
    RAISE EXCEPTION 'Photo tables are missing or old: deploy the site from main first (its build runs prisma migrate deploy).';
  END IF;
  -- Still applied = a change of this run whose URL is still in image_url (a later manual change does not count).
  IF EXISTS (SELECT 1 FROM public.catalog_photo_changes c JOIN public.pharmacy_products p ON p.id = c.product_id
             WHERE c.run_id = 'openfacts-external-2026-11-19' AND c.reverted_at IS NULL AND p.image_url = c.new_image_url) THEN
    RAISE EXCEPTION 'Run openfacts-external-2026-11-19 is already applied. Roll it back first (05_rollback_import.sql) to repeat it.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_photo_import_openfacts) THEN
    RAISE EXCEPTION 'public.catalog_photo_import_openfacts is empty: run the \copy command first.';
  END IF;
END $$;

-- Lock the catalogue rows of the CSV until COMMIT, so nobody changes them between the checks and the update.
SELECT count(*) AS locked_products
FROM (SELECT 1 FROM public.pharmacy_products p
      WHERE p.id IN (SELECT product_id FROM public.catalog_photo_import_openfacts) FOR UPDATE) s;

-- Rows that pass every check.
CREATE TEMP TABLE _photo_plan ON COMMIT DROP AS
SELECT i.*, p.image_url AS previous_image_url
FROM public.catalog_photo_import_openfacts i
JOIN public.pharmacy_products p ON p.id = i.product_id
WHERE coalesce(btrim(p.article), '') = coalesce(btrim(i.article), '')
  AND regexp_replace(btrim(coalesce(p.name, '')), '\s+', ' ', 'g') = regexp_replace(btrim(i.product_name), '\s+', ' ', 'g')
  AND NULLIF(BTRIM(p.image_url), '') IS NULL
  AND i.image_url ~ '^https://images\.open(food|beauty|products)facts\.org/images/products/[^?#]+$'
  AND i.source_page_url LIKE 'https://%'
  AND i.source_license = 'CC BY-SA 3.0'
  AND i.rights_status = 'licensed_cc_by_sa'
  AND i.match_status IN ('confirmed', 'probable')
  AND i.attribution <> ''
  AND i.sha256 ~ '^[0-9a-f]{64}$'
  AND NOT EXISTS (SELECT 1 FROM public.catalog_photo_results r WHERE r.product_id = i.product_id AND r.review_status = 'rejected');

-- image_url: only empty values are filled (the condition is repeated in the UPDATE itself).
CREATE TEMP TABLE _photo_done (product_id BIGINT PRIMARY KEY) ON COMMIT DROP;
WITH updated AS (
  UPDATE public.pharmacy_products p
  SET image_url = pl.image_url
  FROM _photo_plan pl
  WHERE p.id = pl.product_id AND NULLIF(BTRIM(p.image_url), '') IS NULL
  RETURNING p.id, pl.previous_image_url, p.image_url
), logged AS (
  INSERT INTO public.catalog_photo_changes (run_id, product_id, previous_image_url, new_image_url)
  SELECT 'openfacts-external-2026-11-19', id, previous_image_url, image_url FROM updated
  RETURNING product_id
)
INSERT INTO _photo_done SELECT product_id FROM logged;

-- Source, authors and licence of each published photo (shown under the photo on the site).
INSERT INTO public.catalog_photo_results AS r (
  product_id, article, product_name, match_status, match_method, confidence, source_name, source_page_url,
  source_image_url, stored_image_url, source_license, rights_status, attribution, manufacturer, detected_gtin,
  width, height, file_size, sha256, review_status, reason, error, run_id, checked_at, published_at, updated_at,
  storage, published_image_url, source_sha256, source_bytes, source_checked_at)
SELECT pl.product_id, NULLIF(pl.article, ''), pl.product_name, pl.match_status, pl.match_method, pl.confidence,
       pl.source_name, pl.source_page_url, pl.image_url, NULL, pl.source_license, pl.rights_status, pl.attribution,
       NULLIF(pl.manufacturer, ''), NULLIF(pl.detected_gtin, ''), pl.width, pl.height, pl.file_size, pl.sha256,
       'published', pl.review_note, NULL, 'openfacts-external-2026-11-19', pl.checked_at AT TIME ZONE 'UTC',
       now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC',
       'external_url', pl.image_url, pl.source_sha256, pl.source_bytes, pl.source_checked_at AT TIME ZONE 'UTC'
FROM _photo_plan pl
JOIN _photo_done d ON d.product_id = pl.product_id
ON CONFLICT (product_id) DO UPDATE SET
  article = EXCLUDED.article, product_name = EXCLUDED.product_name, match_status = EXCLUDED.match_status,
  match_method = EXCLUDED.match_method, confidence = EXCLUDED.confidence, source_name = EXCLUDED.source_name,
  source_page_url = EXCLUDED.source_page_url, source_image_url = EXCLUDED.source_image_url, stored_image_url = NULL,
  source_license = EXCLUDED.source_license, rights_status = EXCLUDED.rights_status, attribution = EXCLUDED.attribution,
  manufacturer = EXCLUDED.manufacturer, detected_gtin = EXCLUDED.detected_gtin, width = EXCLUDED.width,
  height = EXCLUDED.height, file_size = EXCLUDED.file_size, sha256 = EXCLUDED.sha256, review_status = 'published',
  reason = EXCLUDED.reason, error = NULL, run_id = EXCLUDED.run_id, checked_at = EXCLUDED.checked_at,
  published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at, storage = 'external_url',
  published_image_url = EXCLUDED.published_image_url, source_sha256 = EXCLUDED.source_sha256,
  source_bytes = EXCLUDED.source_bytes, source_checked_at = EXCLUDED.source_checked_at
WHERE r.review_status <> 'rejected';

-- Result of this run (all four numbers must be equal).
SELECT
  (SELECT count(*) FROM _photo_plan)                                                        AS planned,
  (SELECT count(*) FROM _photo_done)                                                        AS image_url_filled,
  (SELECT count(*) FROM public.catalog_photo_results r JOIN _photo_done d USING (product_id)
   WHERE r.review_status = 'published' AND r.storage = 'external_url'
     AND r.run_id = 'openfacts-external-2026-11-19')                                        AS audit_rows_published,
  (SELECT count(*) FROM public.pharmacy_products p JOIN _photo_done d ON d.product_id = p.id
   JOIN _photo_plan pl ON pl.product_id = p.id WHERE p.image_url = pl.image_url)            AS image_url_matches_csv;

COMMIT;
