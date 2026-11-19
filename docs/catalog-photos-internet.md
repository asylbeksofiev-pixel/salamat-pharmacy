# Фото товаров из открытых источников: конвейер

Скрипт: `scripts/catalog-photos/internet.ts` (команды `npm run photos:*`). Результаты последнего прогона:
[catalog-photos-internet-results.md](catalog-photos-internet-results.md).

Задача — найти фото упаковки для товаров `public.pharmacy_products`, у которых `image_url` пустой
(`NULLIF(BTRIM(image_url), '') IS NULL`), привязать каждое к своему `pharmacy_products.id` (артикул может повторяться),
сохранить файл в Vercel Blob и записать URL в Neon. Скрипт запускается на рабочей машине или в CI, **никогда** внутри
Vercel Function или при открытии страницы.

## Что где хранится

| Что | Где |
|---|---|
| Файлы изображений | Vercel Blob (публичное хранилище проекта), `products/{product_id}/{sha256}.{ext}`. Имя = хеш содержимого, перезапись запрещена (`allowOverwrite: false`). |
| URL фото на сайте | `public.pharmacy_products.image_url` — только там, где было пусто. Другие колонки товара не меняются. |
| Источник, лицензия, проверки | `public.catalog_photo_results` — одна строка на товар (PK `product_id`). |
| Журнал изменений | `public.catalog_photo_changes` — `run_id, product_id, previous_image_url, new_image_url, updated_at, reverted_at`. |
| Рабочие данные | `.photo-work/internet/` (в `.gitignore`): снимок каталога, выгрузки, `results.jsonl`, скачанные файлы, журнал. |
| Таблицы для людей | `data/catalog-photos-internet/*.csv` (UTF-8 с BOM, открываются в Excel). |

В PostgreSQL и в Git бинарные файлы не попадают. Миграция `prisma/migrations/20261119140000_catalog_photo_results`
создаёт только две новые таблицы; `pharmacy_products` она не трогает.

## Источники и права

Используются только источники, чьи условия разрешают копирование фото на коммерческий сайт:

| Источник | Лицензия | Как используется |
|---|---|---|
| Open Beauty Facts, Open Food Facts, Open Products Facts | CC BY-SA 3.0 (фото), ODbL (данные) | Официальные выгрузки данных (`static.open*facts.org/data/…`, OFF — по прямой ссылке на S3), одно скачивание вместо тысяч запросов. Поиск — по точному штрихкоду. |

Требование лицензии CC BY-SA — указать авторов, лицензию и ссылку. Сайт показывает под фото
«Фото: Open Beauty Facts contributors, CC BY-SA 3.0» со ссылкой на страницу товара в источнике
(`src/server/catalog-items.ts` берёт подпись из `catalog_photo_results`, `PhotoCredit` её выводит). Файл может быть
повёрнут по EXIF и уменьшен до 1600 px — это не меняет лицензию: файл остаётся под CC BY-SA 3.0.

Не используются:

- **НКТ (nct.gov.kz / nationalcatalog.kz)** — лицензии на повторное использование фото нет (договор с оператором
  п. 7.1/7.4/8.5, Правила № 232-НҚ п. 5/8/10, Закон РК об авторском праве ст. 7 п. 1 пп. 10, ст. 16). Нужна письменная
  договорённость с владельцами карточек.
- **Сайты производителей** — из 15 проверенных ни один не даёт лицензии на копирование фото (у yokosun.ru — прямой
  запрет, у остальных — только политика конфиденциальности или условия магазина). Нужны файлы или письменное
  разрешение (тогда `rights_status = permission_granted`).
- **Маркетплейсы и другие аптеки** (i-teka.kz, aptekaplus.kz, Kaspi и т. п.) и выдача поисковиков — без
  подтверждённого разрешения не используются, даже если фото открыто доступны.

CAPTCHA, авторизация, robots.txt и ограничения частоты не обходятся: запросы к изображениям идут с паузой на хост,
не более 4 параллельно, до 3 повторов с нарастающей задержкой при 429/5xx.

## Правила сопоставления

Сравнение — `assessNctCard` (`src/lib/catalog-photos/nct-match.ts`), общий модуль с проверкой карточек НКТ.

- **confirmed** — штрихкод источника совпадает с артикулом (валидный GTIN по контрольной цифре), ни одна характеристика
  не противоречит, все характеристики из названия SALAMAT (дозировка, форма, объём/масса, количество) подтверждены
  карточкой, бренд из названия есть в карточке, названия совпадают хотя бы наполовину значимых слов.
- **probable** — штрихкод совпадает, но часть характеристик или бренд в карточке не указаны; или найдено несколько
  товаров SALAMAT с этим артикулом и разными названиями; «в ассортименте»; одинаковое фото у разных товаров.
- **doubtful** — фасовка SALAMAT («ФАСОВКА»): фото коробки производителя — это не тот товар.
- **no_match** — кандидата нет, у кандидата нет фото, или есть противоречие: 10 vs 20 таблеток, 250 vs 500 мг,
  крем vs мазь, 30 vs 50 мл, детский vs взрослый, вкус/аромат, размер подгузников, дневные vs ночные и т. п.

Названия на разных языках сравниваются через транслитерацию и словарь синонимов (`SAME_MEANING` в
`src/lib/catalog-photos/similarity.ts`: вода/eau, крем/crème, шампунь/shampooing…). Требования к характеристикам при
этом не ослабляются.

## Проверка файла

Скачивается только изображение кандидата со статусом confirmed или probable и разрешённой лицензией.

- HTTP 200, `Content-Type: image/*`, не HTML/JSON, файл декодируется (sharp), формат JPEG/PNG/WebP/AVIF;
- длинная сторона ≥ 300 px (иначе ошибка), < 500 px — предупреждение; пропорции больше 3:1 — предупреждение;
  однотонная заглушка — ошибка;
- поворот по EXIF; файл > 1600 px уменьшается (никогда не увеличивается) и сохраняется в WebP q90, остальные
  хранятся как есть;
- SHA-256 содержимого — имя файла, дедупликация; один файл у товаров с разными названиями → на проверку;
- штрихкод на фото (ZXing): чужой штрихкод или крупный план штрихкода → предупреждение.

Любое предупреждение переводит confirmed → probable.

## Ручная проверка обязательна

Контроль качества прогона 2026-11-19 нашёл среди 85 confirmed 8 непригодных фото: обратная сторона упаковки,
крупный план штрихкода, листок-инструкция, товар занимает малую часть кадра. Товар во всех 85 случаях был определён
верно, но такие снимки автоматически не отличить. Поэтому `photos:publish` по умолчанию публикует **только фото,
одобренные человеком** (`review_status = approved`); `--allow-unreviewed` разрешает публикацию confirmed без
просмотра, probable и doubtful при этом всё равно не публикуются.

Решения записываются в CSV `product_id,decision,note,sha256` (`decision` = `approve` | `reject`) и применяются
командой `photos:apply-review`. Одобрение относится к конкретному файлу: «approve» применяется, только если
`sha256` в CSV совпадает с файлом текущего прогона (если фото в источнике заменили, товар снова ждёт проверки). Решения человека автоматические прогоны не перезаписывают ни в `results.jsonl`, ни в
`catalog_photo_results`.

## Команды

```bash
npm run photos:snapshot                     # каталог: DATABASE_URL (только чтение) или публичный API сайта
npm run photos:fetch-sources                # выгрузки Open Facts (раз в день максимум)
npm run photos:discover -- --limit 50       # пробный прогон; без --limit — все товары без фото
npm run photos:validate -- --concurrency 3  # скачать и проверить файлы confirmed/probable
npm run photos:review-export                # CSV для людей
npm run photos:apply-review -- data/catalog-photos-internet/qa-decisions.csv               # 85 confirmed
npm run photos:apply-review -- data/catalog-photos-internet/review-probable-2026-11-19.csv  # 664 probable
npm run photos:publish -- --dry-run         # план без изменений (publish-plan-<run_id>.csv)
npm run photos:publish -- --confirm --limit 10 --run-id photos-test-10
npm run photos:rollback -- --run-id photos-test-10 --dry-run
npm run photos:report
```

Общие параметры: `--limit`, `--offset`, `--batch-size` (discover, по умолчанию 500, прогресс сохраняется после каждого
пакета), `--concurrency` (validate, ≤ 4), `--product-id 1,2,3`, `--confirmed-only`, `--force` (повторная обработка уже
обработанных; по умолчанию возобновление), `--work-dir`, `--review-dir`.

### Публикация

Для каждого товара из плана, по одному:

1. `SELECT image_url` — если уже заполнен (кто-то добавил фото после снимка), товар пропускается;
2. файл загружается в Blob (`products/{id}/{sha256}.{ext}`; повторная загрузка того же файла находит существующий);
3. в одной транзакции:
   ```sql
   UPDATE public.pharmacy_products SET image_url = $1 WHERE id = $2 AND NULLIF(BTRIM(image_url), '') IS NULL;
   INSERT INTO catalog_photo_changes (run_id, product_id, previous_image_url, new_image_url) VALUES (…);
   INSERT INTO catalog_photo_results … ON CONFLICT (product_id) DO UPDATE … -- review_status = 'published'
   ```
   Все запросы параметризованы (Prisma tagged templates). Если `UPDATE` изменил 0 строк, журнал не пишется.

После прогона для всех остальных товаров записываются строки аудита (probable, no_match…) — кроме тех, где человек
уже принял решение; `--no-audit` это отключает. CHECK-ограничение в базе не даёт отметить строку как `published` без
файла в хранилище и разрешённой лицензии, а doubtful/no_match — вообще.

### Откат

`photos:rollback -- --run-id RUN --confirm` возвращает `image_url` только для изменений этого прогона и только если в
колонке всё ещё URL этого прогона (фото, заменённое вручную, не трогается). `--delete-files` дополнительно удаляет
файлы из Blob.

## Настройка (один раз, владелец проекта Vercel)

1. Vercel → проект `salamat-pharmacy` → **Storage** → **Create** → **Blob** → создать публичное хранилище
   → **Connect to project** (Production и Preview).
   Vercel сам добавит переменную `BLOB_READ_WRITE_TOKEN`.
2. Получить переменные локально (токен не попадает в Git — `.env*` в `.gitignore`):
   ```bash
   vercel env pull .env.local
   ```
   или скопировать `BLOB_READ_WRITE_TOKEN` и `DATABASE_URL` из Settings → Environment Variables в `.env.local`.
3. Задеплоить ветку: сборка выполнит `prisma migrate deploy` и создаст `catalog_photo_results` и
   `catalog_photo_changes`. `next.config.ts` уже разрешает `https://*.public.blob.vercel-storage.com/products/**`
   для next/image; CSP разрешает `img-src https:`.
4. Собрать файлы заново (рабочая папка `.photo-work` в Git не хранится) и применить решения проверки:
   ```bash
   set -a; . ./.env.local; set +a
   npm ci
   npm run photos:snapshot
   npm run photos:fetch-sources
   npm run photos:discover
   npm run photos:validate
   npm run photos:apply-review -- data/catalog-photos-internet/qa-decisions.csv
   npm run photos:apply-review -- data/catalog-photos-internet/review-probable-2026-11-19.csv
   ```
5. Опубликовать:
   ```bash
   npm run photos:publish -- --dry-run
   npm run photos:publish -- --confirm --limit 10 --run-id photos-2026-11-19-test10
   ```
   Проверить 10 товаров на сайте (каталог «Только с фото», карточка товара, телефон), затем без `--limit`.

| Переменная | Где | Зачем |
|---|---|---|
| `DATABASE_URL` (или `PHOTOS_DATABASE_URL`) | `.env.local` на машине, где запускается публикация | чтение товаров без фото, запись `image_url`, аудит, журнал |
| `BLOB_READ_WRITE_TOKEN` | создаётся Vercel при подключении Blob; локально — `.env.local` | загрузка и удаление файлов |
| `PHOTOS_STORAGE=test` | только для локальной проверки | «загрузка» без сети на тестовый адрес `test-store.public.blob.vercel-storage.com` |

Токены не печатаются в журналах и отчётах и не коммитятся.

## Стоимость Blob

Тариф Vercel Blob (iad1, по документации Vercel): хранение $0.023 за ГБ-месяц, загрузки (advanced operations)
$5 за 1 млн, чтения мимо кэша $0.40 за 1 млн, исходящий трафик $0.05 за ГБ; на Hobby бесплатно 1 ГБ хранения,
2 000 загрузок, 10 000 чтений и 10 ГБ трафика в месяц. 77 одобренных фото — 11,1 МБ и 77 загрузок; все 749 фото
confirmed + probable — около 114 МБ. Оба варианта укладываются в бесплатный лимит Hobby; на Pro это доли цента в
месяц за хранение.
