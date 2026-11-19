-- SALAMAT · Open Facts photos as direct links · step 5 (only if needed): roll back exactly this import.
-- Restores the previous image_url only where the column still holds the URL written by run
-- openfacts-external-2026-11-19; a photo changed by hand after the import is never touched.
-- Run:  \i 'C:/salamat/05_rollback_import.sql'

\set ON_ERROR_STOP on
BEGIN;

WITH reverted AS (
  UPDATE public.pharmacy_products p
  SET image_url = c.previous_image_url
  FROM public.catalog_photo_changes c
  WHERE c.run_id = 'openfacts-external-2026-11-19' AND c.reverted_at IS NULL
    AND p.id = c.product_id AND p.image_url = c.new_image_url
  RETURNING p.id
), log AS (
  UPDATE public.catalog_photo_changes c
  SET reverted_at = now()
  FROM reverted
  WHERE c.run_id = 'openfacts-external-2026-11-19' AND c.reverted_at IS NULL AND c.product_id = reverted.id
  RETURNING c.product_id
), audit AS (
  UPDATE public.catalog_photo_results r
  SET review_status = 'rolled_back', published_at = NULL, updated_at = now() AT TIME ZONE 'UTC'
  FROM reverted
  WHERE r.product_id = reverted.id AND r.run_id = 'openfacts-external-2026-11-19'
  RETURNING r.product_id
)
SELECT (SELECT count(*) FROM reverted) AS image_url_restored,
       (SELECT count(*) FROM log)      AS log_rows_marked,
       (SELECT count(*) FROM audit)    AS audit_rows_rolled_back;

-- Changes of this run that were NOT undone because the photo was changed by hand afterwards.
SELECT c.product_id, c.new_image_url, p.image_url AS current_image_url
FROM public.catalog_photo_changes c
JOIN public.pharmacy_products p ON p.id = c.product_id
WHERE c.run_id = 'openfacts-external-2026-11-19' AND c.reverted_at IS NULL;

COMMIT;
