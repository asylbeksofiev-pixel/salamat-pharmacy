-- Branch list update, 18.11.2026 — data from the network: prisma/data/branches.json.
-- Purpose (data only, no schema change):
--   1. Closed branches SAL-06 (пр. Мәңгілік Ел, д. 36, н.п. 8) and SAL-07 (пр. Мәңгілік Ел, д. 49, н.п. 1) are deactivated.
--      Records are kept (order history); inactive branches are hidden on every public page and the map.
--   2. +77025314485 is removed from SAL-07 and attached to the new branch пр. Мәңгілік Ел, д. 24.
--   3. Five branches are added (SAL-15…SAL-19). An existing record with the same code, slug or street + house is updated
--      instead of creating a duplicate.
--   4. Coordinates from branches.json are set for the 12 remaining branches, only where none are stored yet.
--   5. +77755013466 belongs to ул. Есет батыра, д. 11 (Ильинка 2) per branches.json, so it is removed from SAL-14.
-- Placeholder phone +7 700 000 00 00 (пр. Туран, 55) is not stored. Nothing is deleted.
-- On a fresh database (no seeded city yet) this does nothing: prisma/seed.ts creates the same state from seed-data.ts.

DO $$
DECLARE
  now_ts timestamp(3) := now();
  astana_id text;
  arshaly_id text;
  source_id text;
  pid text;
  r record;
BEGIN
  SELECT "id" INTO astana_id FROM "City" WHERE "slug" = 'astana';
  IF astana_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO "DataSource" ("id", "code", "name", "kind", "notes", "isDemo", "verifiedAt", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, 'salamat-branches-2026-11', 'Список филиалов от сети SALAMAT (18.11.2026)', 'MANUAL',
          'prisma/data/branches.json', false, '2026-11-18 12:00:00', now_ts, now_ts)
  ON CONFLICT ("code") DO NOTHING;
  SELECT "id" INTO source_id FROM "DataSource" WHERE "code" = 'salamat-branches-2026-11';

  INSERT INTO "City" ("id", "slug", "nameRu", "nameKk", "isActive", "sortOrder", "createdAt")
  VALUES (gen_random_uuid()::text, 'arshaly-district', 'Аршалынский район, Акмолинская область', 'Ақмола облысы, Аршалы ауданы', true, 10, now_ts)
  ON CONFLICT ("slug") DO NOTHING;
  SELECT "id" INTO arshaly_id FROM "City" WHERE "slug" = 'arshaly-district';

  -- 1–2. Closed branches.
  UPDATE "Pharmacy"
     SET "isActive" = false, "acceptsOrders" = false, "updatedAt" = now_ts,
         "internalNote" = concat_ws(' · ', nullif("internalNote", ''), 'Филиал закрыт (18.11.2026)')
   WHERE "code" IN ('SAL-06', 'SAL-07') AND "isActive" = true;
  UPDATE "Pharmacy"
     SET "phones" = array_remove("phones", '+77025314485'), "updatedAt" = now_ts
   WHERE "code" = 'SAL-07';

  -- 3. New branches.
  FOR r IN
    SELECT * FROM (VALUES
      ('SAL-15', 'mangilik-el-24', 'пр. Мәңгілік Ел, д. 24', 'г. Астана, пр. Мәңгілік Ел, 24', ARRAY['+77025314485']::text[], 51.1146949, 71.4345743, 'astana', 15, '(Мәңгілік|Мангилик)\s+Ел', '24', 'Номер +77025314485 перенесён с закрытого филиала SAL-07'),
      ('SAL-16', 'nazhimedenova-13', 'ул. Ж. Нажимеденова, д. 13', 'г. Астана, ул. Нажимеденова, 13', ARRAY['+77080360167']::text[], 51.1141329, 71.5099847, 'astana', 16, 'Нажимеденов', '13', NULL),
      ('SAL-17', 'eset-batyra-11', 'ул. Есет батыра, д. 11 (Ильинка 2)', 'г. Астана, ул. Есет Батыра, 11 (Ильинка 2)', ARRAY['+77755013466']::text[], 51.04351, 71.4521, 'astana', 17, 'Есет', '11', NULL),
      ('SAL-18', 'zhibek-zholy-kurmanova-8-3', 'с. Жибек Жолы, ул. Курманова, д. 8/3', 'с. Жибек Жолы, ул. Курманова, 8/3 (Аршалынский район, Акмолинская область)', ARRAY['+77750054291']::text[], 51.081496, 71.7445455, 'arshaly-district', 18, 'Курманов', '8/3', NULL),
      ('SAL-19', 'turan-55', 'пр. Туран, д. 55, н.п. 8', 'г. Астана, пр. Туран, 55, н.п. 8', ARRAY[]::text[], 51.1127627, 71.3983764, 'astana', 19, 'Туран', '55', 'В списке сети телефон-заглушка +7 700 000 00 00 — настоящий номер не указан, на сайте телефон не показывается')
    ) AS v("code", "slug", "address", "source_address", "phones", "lat", "lng", "city", "sort", "street_re", "house", "note")
  LOOP
    SELECT "id" INTO pid FROM "Pharmacy"
     WHERE "code" = r."code" OR "slug" = r."slug"
        OR ("addressRu" ~* r."street_re" AND "addressRu" ~ ('(^|[^0-9/])' || r."house" || '([^0-9/]|$)'))
     ORDER BY ("code" = r."code") DESC, ("slug" = r."slug") DESC
     LIMIT 1;
    IF pid IS NULL THEN
      INSERT INTO "Pharmacy" ("id", "code", "slug", "cityId", "addressRu", "sourceAddress", "phones", "latitude", "longitude",
                              "isActive", "acceptsOrders", "sortOrder", "sourceId", "verifiedAt", "internalNote", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, r."code", r."slug", CASE WHEN r."city" = 'arshaly-district' THEN arshaly_id ELSE astana_id END,
              r."address", r."source_address", r."phones", r."lat", r."lng",
              true, true, r."sort", source_id, '2026-11-18 12:00:00', r."note", now_ts, now_ts);
    ELSE
      UPDATE "Pharmacy"
         SET "addressRu" = r."address", "sourceAddress" = r."source_address",
             "cityId" = CASE WHEN r."city" = 'arshaly-district' THEN arshaly_id ELSE astana_id END,
             "phones" = (SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[]) FROM unnest("phones" || r."phones") AS x WHERE x <> '+77000000000'),
             "latitude" = r."lat", "longitude" = r."lng", "isActive" = true, "acceptsOrders" = true,
             "sourceId" = source_id, "verifiedAt" = '2026-11-18 12:00:00',
             "internalNote" = coalesce(r."note", "internalNote"), "updatedAt" = now_ts
       WHERE "id" = pid;
    END IF;
  END LOOP;

  -- 4. Coordinates of the remaining branches.
  UPDATE "Pharmacy" SET "latitude" = 51.1329482, "longitude" = 71.3773028, "updatedAt" = now_ts WHERE "code" = 'SAL-01' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1685412, "longitude" = 71.4123567, "updatedAt" = now_ts WHERE "code" = 'SAL-02' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.0931068, "longitude" = 71.4486238, "updatedAt" = now_ts WHERE "code" = 'SAL-03' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1408541, "longitude" = 71.3871596, "updatedAt" = now_ts WHERE "code" = 'SAL-04' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.0856513, "longitude" = 71.421919, "updatedAt" = now_ts WHERE "code" = 'SAL-05' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.0920359, "longitude" = 71.4265061, "updatedAt" = now_ts WHERE "code" = 'SAL-08' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1129062, "longitude" = 71.430604, "updatedAt" = now_ts WHERE "code" = 'SAL-09' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1542051, "longitude" = 71.4852862, "updatedAt" = now_ts WHERE "code" = 'SAL-10' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1293945, "longitude" = 71.4581188, "updatedAt" = now_ts WHERE "code" = 'SAL-11' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1208034, "longitude" = 71.4199543, "updatedAt" = now_ts WHERE "code" = 'SAL-12' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.1351278, "longitude" = 71.4273403, "updatedAt" = now_ts WHERE "code" = 'SAL-13' AND "latitude" IS NULL AND "longitude" IS NULL;
  UPDATE "Pharmacy" SET "latitude" = 51.04123, "longitude" = 71.45589, "updatedAt" = now_ts WHERE "code" = 'SAL-14' AND "latitude" IS NULL AND "longitude" IS NULL;

  -- 5. +77755013466 now belongs to SAL-17 only.
  UPDATE "Pharmacy"
     SET "phones" = array_remove("phones", '+77755013466'), "updatedAt" = now_ts
   WHERE "code" = 'SAL-14' AND EXISTS (SELECT 1 FROM "Pharmacy" WHERE "code" = 'SAL-17' AND '+77755013466' = ANY("phones"));
END $$;
