-- SALAMAT · Open Facts photos as direct links · step 3 of 5: checks. Read only — changes nothing.
-- Expected on 2026-11-19: staged 576, ready_to_apply 576 (fewer is fine if someone added photos meanwhile:
-- such products are skipped, never overwritten).

-- 0. The database has the photo tables of the deployed code (migrations 20261119140000 and 20261119180000).
SELECT
  to_regclass('public.catalog_photo_results') IS NOT NULL                                   AS has_catalog_photo_results,
  to_regclass('public.catalog_photo_changes') IS NOT NULL                                   AS has_catalog_photo_changes,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'catalog_photo_results' AND column_name = 'storage') AS has_storage_column,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'pharmacy_products' AND column_name = 'image_url')   AS has_image_url_column;

-- 1. Summary: what the apply step would do.
WITH i AS (
  SELECT i.*,
         p.id IS NOT NULL                                                                         AS product_found,
         coalesce(btrim(p.article), '') = coalesce(btrim(i.article), '')                          AS article_ok,
         regexp_replace(btrim(coalesce(p.name, '')), '\s+', ' ', 'g')
           = regexp_replace(btrim(i.product_name), '\s+', ' ', 'g')                               AS name_ok,
         NULLIF(BTRIM(p.image_url), '') IS NULL                                                   AS image_empty,
         i.image_url ~ '^https://images\.open(food|beauty|products)facts\.org/images/products/[^?#]+$' AS url_ok,
         i.source_page_url LIKE 'https://%' AND i.source_license = 'CC BY-SA 3.0'
           AND i.rights_status = 'licensed_cc_by_sa' AND i.match_status IN ('confirmed', 'probable')
           AND i.attribution <> '' AND i.sha256 ~ '^[0-9a-f]{64}$'                                AS licence_ok,
         EXISTS (SELECT 1 FROM public.catalog_photo_results r
                 WHERE r.product_id = i.product_id AND r.review_status = 'rejected')              AS rejected_before
  FROM public.catalog_photo_import_openfacts i
  LEFT JOIN public.pharmacy_products p ON p.id = i.product_id
)
SELECT
  count(*)                                                                         AS staged,
  count(DISTINCT product_id)                                                       AS distinct_products,
  count(*) FILTER (WHERE NOT product_found)                                        AS product_not_found,
  count(*) FILTER (WHERE product_found AND NOT article_ok)                         AS article_mismatch,
  count(*) FILTER (WHERE product_found AND NOT name_ok)                            AS name_mismatch,
  count(*) FILTER (WHERE product_found AND NOT image_empty)                        AS already_has_photo,
  count(*) FILTER (WHERE NOT url_ok)                                               AS bad_url,
  count(*) FILTER (WHERE NOT licence_ok)                                           AS bad_licence_or_status,
  count(*) FILTER (WHERE rejected_before)                                          AS rejected_before,
  count(*) FILTER (WHERE product_found AND article_ok AND name_ok AND image_empty
                     AND url_ok AND licence_ok AND NOT rejected_before)            AS ready_to_apply,
  (SELECT count(*) FROM public.catalog_photo_changes c JOIN public.pharmacy_products p ON p.id = c.product_id
   WHERE c.run_id = 'openfacts-external-2026-11-19' AND c.reverted_at IS NULL
     AND p.image_url = c.new_image_url)                                            AS already_applied_by_this_run
FROM i;

-- 2. Rows that will be skipped, with the reason (first 100).
SELECT i.product_id, i.article AS csv_article, p.article AS db_article,
       i.product_name AS csv_name, p.name AS db_name, left(p.image_url, 80) AS db_image_url,
       CASE
         WHEN p.id IS NULL THEN 'product_not_found'
         WHEN coalesce(btrim(p.article), '') <> coalesce(btrim(i.article), '') THEN 'article_mismatch'
         WHEN regexp_replace(btrim(coalesce(p.name, '')), '\s+', ' ', 'g') <> regexp_replace(btrim(i.product_name), '\s+', ' ', 'g') THEN 'name_mismatch'
         WHEN NULLIF(BTRIM(p.image_url), '') IS NOT NULL THEN 'already_has_photo'
         ELSE 'url_or_licence'
       END AS reason
FROM public.catalog_photo_import_openfacts i
LEFT JOIN public.pharmacy_products p ON p.id = i.product_id
WHERE p.id IS NULL
   OR coalesce(btrim(p.article), '') <> coalesce(btrim(i.article), '')
   OR regexp_replace(btrim(coalesce(p.name, '')), '\s+', ' ', 'g') <> regexp_replace(btrim(i.product_name), '\s+', ' ', 'g')
   OR NULLIF(BTRIM(p.image_url), '') IS NOT NULL
   OR i.image_url !~ '^https://images\.open(food|beauty|products)facts\.org/images/products/[^?#]+$'
ORDER BY i.product_id
LIMIT 100;

-- 3. Photos per source (expected: Open Beauty Facts 315, Open Food Facts 254, Open Products Facts 7).
SELECT source_name, match_status, count(*) FROM public.catalog_photo_import_openfacts GROUP BY 1, 2 ORDER BY 1, 2;
