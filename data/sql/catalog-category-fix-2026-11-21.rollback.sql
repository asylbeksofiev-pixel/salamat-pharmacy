-- SALAMAT: откат исправления разделов sql-2026-11-21-category-fix.
-- Возвращает прежние значения только тем строкам, которые до сих пор содержат ровно то, что записал этот запуск;
-- строки, изменённые позже (в т. ч. подтверждённые вручную), не трогаются. Журнал изменений сохраняется.
-- Как запустить: psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f data/sql/catalog-category-fix-2026-11-21.rollback.sql
-- То же самое через скрипт: npm run catalog:classify -- --rollback sql-2026-11-21-category-fix --yes
BEGIN;

WITH ch AS (
  SELECT DISTINCT ON ("product_id") "product_id", "previous", "next"
  FROM "catalog_item_category_changes" WHERE "run_id" = 'sql-2026-11-21-category-fix' AND "previous" IS NOT NULL
  ORDER BY "product_id", "id" DESC
),
restorable AS (
  SELECT ch.* FROM ch JOIN "catalog_item_categories" c ON c."product_id" = ch."product_id"
  WHERE c."run_id" = 'sql-2026-11-21-category-fix'
    AND c."classifier_version" = ch."next"->>'classifierVersion'
    AND c."method" = ch."next"->>'method'
    AND c."review_status" = ch."next"->>'reviewStatus'
    AND c."category_id" IS NOT DISTINCT FROM ch."next"->>'categoryId'
)
UPDATE "catalog_item_categories" c SET
  "category_id" = r."previous"->>'categoryId',
  "confidence" = (r."previous"->>'confidence')::numeric,
  "method" = r."previous"->>'method',
  "reason" = r."previous"->>'reason',
  "review_status" = r."previous"->>'reviewStatus',
  "classifier_version" = r."previous"->>'classifierVersion',
  "run_id" = r."previous"->>'runId',
  "updated_at" = now()
FROM restorable r
WHERE c."product_id" = r."product_id";

UPDATE "catalog_classification_runs" SET "rolled_back_at" = now() WHERE "id" = 'sql-2026-11-21-category-fix' AND "rolled_back_at" IS NULL;

COMMIT;
