// Targeted, reversible correction of catalogue sections after a classifier change.
//
//   npm run catalog:category-fix -- --current <report.csv> [--tag 2026-11-21]
//
// <report.csv> is the classification that is live now (the CSV written by `npm run catalog:classify`, e.g. the
// committed data/reports/catalog-classification.csv before the classifier change:
//   git show d58e66e:data/reports/catalog-classification.csv > /tmp/before.csv).
// Every product name is classified again with the current rules; only rows whose section, status, rule or
// confidence change are written out. Nothing is read from or written to a database.
//
// Output (all reproducible from the two inputs):
//   data/reports/catalog-category-fix-<tag>.csv            product_id, article, name, current/proposed section, reason
//   data/reports/catalog-category-fix-<tag>.ambiguous.csv  changes and remaining products a person should confirm
//   data/sql/catalog-category-fix-<tag>.preview.sql        read-only: what apply would change in the database now
//   data/sql/catalog-category-fix-<tag>.apply.sql          the change itself in one transaction (same as the migration)
//   data/sql/catalog-category-fix-<tag>.rollback.sql       undo: previous values back, only rows still as written
//   prisma/migrations/<stamp>_catalog_category_fix/migration.sql   applied by `prisma migrate deploy` on deploy
//
// Safety of the SQL: a row is updated only when it still holds exactly the assignment this report was made from
// (section, rule, status, classifier version) and was not confirmed by a person; every updated row is logged in
// catalog_item_category_changes with its previous value under one run id (also undoable with
// `npm run catalog:classify -- --rollback <runId> --yes`). Product ids, articles, names and photos are never touched.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CATEGORY_SLUGS, CLASSIFIER_VERSION, classifyName, type CategorySlug } from "../src/lib/catalog-classify";
import { parseCsvObjects, toCsv } from "../src/lib/csv";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const currentPath = opt("current");
const tag = opt("tag") ?? "2026-11-21";
const migrationDir = opt("migration") ?? "prisma/migrations/20261121090100_catalog_category_fix";
if (!currentPath) {
  console.error("Usage: npm run catalog:category-fix -- --current <report.csv> [--tag YYYY-MM-DD]");
  process.exit(2);
}
const RUN_ID = `sql-${tag}-category-fix`;

const SECTION_RU: Record<CategorySlug, string> = {
  "lekarstvennye-sredstva": "Лекарственные средства",
  "vitaminy-i-bady": "Витамины и БАДы",
  "travy-i-sbory": "Травы и сборы",
  "medicinskie-pribory-i-izdeliya": "Медицинские приборы и изделия",
  "pravilnoe-pitanie": "Правильное питание",
  "mama-i-malysh": "Мама и малыш",
  "lechebnaya-kosmetika": "Лечебная косметика",
  "uhod-za-polostyu-rta": "Уход за полостью рта",
  gigiena: "Гигиена",
};

interface Current {
  id: string;
  article: string;
  name: string;
  slug: CategorySlug | null;
  confidence: number;
  method: string;
  reason: string;
  status: "auto" | "needs_review" | "confirmed";
}

const rows: Current[] = parseCsvObjects(readFileSync(currentPath, "utf8").replace(/^﻿/, "")).map((r) => ({
  id: r.product_id,
  article: r.article ?? "",
  name: r.name ?? "",
  slug: (r.category_slug || null) as CategorySlug | null,
  confidence: Number(r.confidence),
  method: r.method,
  reason: r.reason,
  status: r.review_status as Current["status"],
}));
for (const r of rows) {
  if (!/^[1-9]\d{0,17}$/.test(r.id)) throw new Error(`invalid product_id ${r.id}`);
  if (r.slug && !(CATEGORY_SLUGS as readonly string[]).includes(r.slug)) throw new Error(`unknown section ${r.slug} for ${r.id}`);
}
const published = (slug: CategorySlug | null, status: string) => (slug && status !== "needs_review" ? slug : null);
const label = (slug: CategorySlug | null, status: string) =>
  slug ? `${SECTION_RU[slug]}${status === "needs_review" ? " (предложение, ждёт проверки)" : ""}` : "— (без раздела, ждёт проверки)";

interface Change {
  cur: Current;
  next: { slug: CategorySlug | null; confidence: number; method: string; reason: string; status: "auto" | "needs_review" };
  visible: boolean;
}

const changes: Change[] = [];
let keptConfirmed = 0;
for (const cur of rows) {
  if (cur.status === "confirmed") {
    keptConfirmed++;
    continue;
  }
  const c = classifyName(cur.name);
  const next = { slug: c.category, confidence: c.confidence, method: c.method, reason: c.reason, status: c.reviewStatus };
  if (next.slug === cur.slug && next.status === cur.status && next.method === cur.method && next.confidence === cur.confidence) continue;
  changes.push({ cur, next, visible: published(cur.slug, cur.status) !== published(next.slug, next.status) });
}
changes.sort((a, b) => Number(b.visible) - Number(a.visible) || String(a.cur.slug).localeCompare(String(b.cur.slug)) || a.cur.name.localeCompare(b.cur.name, "ru") || Number(a.cur.id) - Number(b.cur.id));

// ---------- report ----------
mkdirSync("data/reports", { recursive: true });
mkdirSync("data/sql", { recursive: true });
const reportPath = `data/reports/catalog-category-fix-${tag}.csv`;
writeFileSync(
  reportPath,
  toCsv(
    ["product_id", "article", "name", "current_category", "proposed_category", "reason", "visible_change", "current_status", "proposed_status", "current_rule", "proposed_rule"],
    changes.map((ch) => [
      ch.cur.id,
      ch.cur.article,
      ch.cur.name,
      label(ch.cur.slug, ch.cur.status),
      label(ch.next.slug, ch.next.status),
      ch.next.reason,
      ch.visible ? "да" : "нет (тот же раздел, уточнено правило)",
      ch.cur.status,
      ch.next.status,
      ch.cur.method,
      ch.next.method,
    ]),
  ),
);

// Ambiguous: (a) changes decided by a "closest section" or "status not visible in the name" rule, (b) products that
// stay in "Medicines" although their names look like food, cosmetics or supplements — the rules do not move them.
const DECIDE: Record<string, string> = {
  "rule:household": "В каталоге нет раздела бытовых товаров: выбран ближайший — «Гигиена». Подтвердите или укажите другой.",
  "rule:baby.household": "Бытовое средство для детских вещей: «Мама и малыш» по назначению или «Гигиена».",
  "rule:baby.mother": "Послеродовое бельё: «Мама и малыш» (как послеродовые прокладки и бандажи) или «Гигиена».",
  "rule:food.sweets": "Сладости на развес: «Правильное питание» (как другие конфеты и мармелад). Проверьте, что это не лекарство.",
  "rule:supplements.brand-form": "Линейка БАД производителя в лекарственной форме: по названию статус (ЛС или БАД) не подтверждается.",
  "rule:supplements.brand": "Линейка БАД производителя: по названию статус (ЛС или БАД) не подтверждается.",
};
const STILL_MEDICINE_HINTS: [RegExp, string][] = [
  [/масло .*капсул|капсул.*масло/i, "Масло в капсулах: может быть БАД"],
  [/бадяг/i, "Бадяга: может быть косметикой или лекарством"],
  [/слим|для похуд/i, "Средство для похудения: может быть БАД"],
  [/тестогенон|гербавижн|лютиголд/i, "Название линейки БАД"],
  [/(?:^|\s)чай(?:\s|$)|фито-чай/i, "Чай: может быть травяным сбором"],
];
const ambiguous: (string | number)[][] = [];
for (const ch of changes) {
  const why = DECIDE[ch.next.method];
  if (why) ambiguous.push([ch.cur.id, ch.cur.article, ch.cur.name, label(ch.cur.slug, ch.cur.status), label(ch.next.slug, ch.next.status), why]);
}
const changedIds = new Set(changes.map((c) => c.cur.id));
for (const r of rows) {
  if (changedIds.has(r.id) || r.slug !== "lekarstvennye-sredstva" || r.status === "needs_review") continue;
  const hit = STILL_MEDICINE_HINTS.find(([re]) => re.test(r.name));
  if (hit) ambiguous.push([r.id, r.article, r.name, label(r.slug, r.status), label(r.slug, r.status), `${hit[1]} — правило оставило «Лекарственные средства», нужна проверка`]);
}
const ambiguousPath = `data/reports/catalog-category-fix-${tag}.ambiguous.csv`;
writeFileSync(ambiguousPath, toCsv(["product_id", "article", "name", "current_category", "proposed_category", "question"], ambiguous));

// ---------- SQL ----------
const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const values = changes
  .map(
    (ch) =>
      `  (${ch.cur.id}::bigint, ${q(ch.cur.slug)}, ${q(ch.cur.method)}, ${q(ch.cur.status)}, ${ch.cur.confidence.toFixed(2)}::numeric, ${q(ch.next.slug)}, ${ch.next.confidence.toFixed(2)}::numeric, ${q(ch.next.method)}, ${q(ch.next.reason)}, ${q(ch.next.status)})`,
  )
  .join(",\n");
const FIX_CTE = `fix ("product_id", "prev_slug", "prev_method", "prev_status", "prev_confidence", "next_slug", "next_confidence", "next_method", "next_reason", "next_status") AS (VALUES
${values}
)`;
// A row qualifies only while it still holds exactly what the report was made from, and was not confirmed by a person.
const TARGET = `target AS (
  SELECT c."product_id", c."category_id", c."confidence", c."method", c."reason", c."review_status", c."classifier_version", c."run_id",
         nk."id" AS "next_category_id", f."next_confidence", f."next_method", f."next_reason", f."next_status"
  FROM fix f
  JOIN "catalog_item_categories" c ON c."product_id" = f."product_id"
  LEFT JOIN "Category" pk ON pk."id" = c."category_id"
  LEFT JOIN "Category" nk ON nk."slug" = f."next_slug"
  WHERE c."review_status" <> 'confirmed'
    AND c."review_status" = f."prev_status"
    AND c."method" = f."prev_method"
    AND c."confidence" = f."prev_confidence"
    AND pk."slug" IS NOT DISTINCT FROM f."prev_slug"
    AND c."classifier_version" <> '${CLASSIFIER_VERSION}'
    AND (f."next_slug" IS NULL OR nk."id" IS NOT NULL)
)`;

const header = (what: string) => `-- SALAMAT: исправление разделов каталога (${tag}), классификатор ${CLASSIFIER_VERSION}. ${what}
-- Источник: scripts/catalog-category-fix.ts, отчёт ${reportPath} (${changes.length} строк, из них ${changes.filter((c) => c.visible).length} со сменой раздела на сайте).
-- Меняется только catalog_item_categories (раздел товара). Товары, артикулы, названия, фото, цены и заявки не меняются.
-- Строки, подтверждённые вручную (review_status = 'confirmed'), и строки, изменённые после отчёта, не трогаются.
`;

const applyBody = `-- 1. Запуск в журнале (нужен для отката). Создаётся один раз и только если в базе уже есть назначения разделов.
INSERT INTO "catalog_classification_runs" ("id", "mode", "classifier_version", "started_at", "finished_at", "stats")
SELECT '${RUN_ID}', 'apply', '${CLASSIFIER_VERSION}', now(), now(), '{"source": "${reportPath}", "planned": ${changes.length}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "catalog_classification_runs" WHERE "id" = '${RUN_ID}')
  AND EXISTS (SELECT 1 FROM "catalog_item_categories");

-- 2. Прежние значения — в журнал изменений, новые — в catalog_item_categories (один оператор, один снимок данных).
WITH ${FIX_CTE},
${TARGET},
logged AS (
  INSERT INTO "catalog_item_category_changes" ("run_id", "product_id", "previous", "next")
  SELECT '${RUN_ID}', t."product_id",
    jsonb_build_object('categoryId', t."category_id", 'confidence', t."confidence"::float8, 'method', t."method", 'reason', t."reason",
                       'reviewStatus', t."review_status", 'classifierVersion', t."classifier_version", 'runId', t."run_id"),
    jsonb_build_object('categoryId', t."next_category_id", 'confidence', t."next_confidence"::float8, 'method', t."next_method", 'reason', t."next_reason",
                       'reviewStatus', t."next_status", 'classifierVersion', '${CLASSIFIER_VERSION}')
  FROM target t
  -- after a rollback the same run is not applied again (clear rolled_back_at on purpose to re-apply)
  WHERE EXISTS (SELECT 1 FROM "catalog_classification_runs" WHERE "id" = '${RUN_ID}' AND "rolled_back_at" IS NULL)
  RETURNING "product_id"
)
UPDATE "catalog_item_categories" c SET
  "category_id" = t."next_category_id",
  "confidence" = t."next_confidence",
  "method" = t."next_method",
  "reason" = t."next_reason",
  "review_status" = t."next_status",
  "classifier_version" = '${CLASSIFIER_VERSION}',
  "run_id" = '${RUN_ID}',
  "updated_at" = now()
FROM target t
WHERE c."product_id" = t."product_id" AND t."product_id" IN (SELECT "product_id" FROM logged);

-- 3. Итог запуска.
UPDATE "catalog_classification_runs" r SET "stats" = r."stats" || jsonb_build_object('changed', (SELECT count(*) FROM "catalog_item_category_changes" x WHERE x."run_id" = '${RUN_ID}'))
WHERE r."id" = '${RUN_ID}';
`;

const migration = `${header("Применяется `prisma migrate deploy` при сборке.")}-- Повторный запуск ничего не меняет. Откат: data/sql/catalog-category-fix-${tag}.rollback.sql
-- или npm run catalog:classify -- --rollback ${RUN_ID} --yes
${applyBody}`;

const apply = `${header("Применение вручную (если миграция ещё не применена).")}-- Как запустить: Neon Console → SQL Editor → вставить файл → Run, или
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f data/sql/catalog-category-fix-${tag}.apply.sql
-- Повторный запуск безопасен (уже исправленные строки не подходят под условия).
BEGIN;

${applyBody}
COMMIT;

-- Проверка: сколько строк изменил этот запуск и сколько товаров в разделах.
SELECT count(*) AS "изменено_строк" FROM "catalog_item_category_changes" WHERE "run_id" = '${RUN_ID}';
SELECT coalesce(k."nameRu", '— требует проверки') AS "раздел", count(*) AS "товаров"
FROM "catalog_item_categories" x LEFT JOIN "Category" k ON k."id" = x."category_id" AND x."review_status" IN ('auto', 'confirmed')
GROUP BY 1 ORDER BY 2 DESC;
`;

const preview = `${header("Только чтение: что изменит применение прямо сейчас.")}-- psql "$DATABASE_URL_UNPOOLED" -f data/sql/catalog-category-fix-${tag}.preview.sql
WITH ${FIX_CTE},
${TARGET}
SELECT f."product_id", p."article", p."name",
       pk."slug" AS "current_category", c."review_status" AS "current_status",
       f."next_slug" AS "proposed_category", f."next_status" AS "proposed_status", f."next_reason" AS "reason",
       CASE
         WHEN c."product_id" IS NULL THEN 'пропуск: нет строки в catalog_item_categories'
         WHEN c."review_status" = 'confirmed' THEN 'пропуск: подтверждено вручную'
         WHEN t."product_id" IS NULL AND c."classifier_version" = '${CLASSIFIER_VERSION}' THEN 'уже применено'
         WHEN t."product_id" IS NULL THEN 'пропуск: строка изменилась после отчёта'
         ELSE 'будет изменено'
       END AS "action"
FROM fix f
LEFT JOIN "public"."pharmacy_products" p ON p."id" = f."product_id"
LEFT JOIN "catalog_item_categories" c ON c."product_id" = f."product_id"
LEFT JOIN "Category" pk ON pk."id" = c."category_id"
LEFT JOIN target t ON t."product_id" = f."product_id"
ORDER BY "action", f."product_id";
`;

const rollback = `-- SALAMAT: откат исправления разделов ${RUN_ID}.
-- Возвращает прежние значения только тем строкам, которые до сих пор содержат ровно то, что записал этот запуск;
-- строки, изменённые позже (в т. ч. подтверждённые вручную), не трогаются. Журнал изменений сохраняется.
-- Как запустить: psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f data/sql/catalog-category-fix-${tag}.rollback.sql
-- То же самое через скрипт: npm run catalog:classify -- --rollback ${RUN_ID} --yes
BEGIN;

WITH ch AS (
  SELECT DISTINCT ON ("product_id") "product_id", "previous", "next"
  FROM "catalog_item_category_changes" WHERE "run_id" = '${RUN_ID}' AND "previous" IS NOT NULL
  ORDER BY "product_id", "id" DESC
),
restorable AS (
  SELECT ch.* FROM ch JOIN "catalog_item_categories" c ON c."product_id" = ch."product_id"
  WHERE c."run_id" = '${RUN_ID}'
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

UPDATE "catalog_classification_runs" SET "rolled_back_at" = now() WHERE "id" = '${RUN_ID}' AND "rolled_back_at" IS NULL;

COMMIT;
`;

writeFileSync(`data/sql/catalog-category-fix-${tag}.preview.sql`, preview);
writeFileSync(`data/sql/catalog-category-fix-${tag}.apply.sql`, apply);
writeFileSync(`data/sql/catalog-category-fix-${tag}.rollback.sql`, rollback);
mkdirSync(migrationDir, { recursive: true });
writeFileSync(`${migrationDir}/migration.sql`, migration);

const byMove = new Map<string, number>();
for (const ch of changes.filter((c) => c.visible)) {
  const k = `${published(ch.cur.slug, ch.cur.status) ?? "—"} → ${published(ch.next.slug, ch.next.status) ?? "—"}`;
  byMove.set(k, (byMove.get(k) ?? 0) + 1);
}
console.log(
  JSON.stringify(
    {
      classifierVersion: CLASSIFIER_VERSION,
      runId: RUN_ID,
      products: rows.length,
      keptConfirmed,
      changedRows: changes.length,
      visibleChanges: changes.filter((c) => c.visible).length,
      ambiguous: ambiguous.length,
      moves: Object.fromEntries([...byMove].sort((a, b) => b[1] - a[1])),
      files: [reportPath, ambiguousPath, `data/sql/catalog-category-fix-${tag}.{preview,apply,rollback}.sql`, `${migrationDir}/migration.sql`],
    },
    null,
    2,
  ),
);
