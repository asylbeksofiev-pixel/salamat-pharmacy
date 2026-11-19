# Импорт 576 фото Open Facts прямыми ссылками (psql, Windows)

Что делает импорт: заполняет `public.pharmacy_products.image_url` исходной публичной HTTPS-ссылкой Open Facts
(`https://images.open…facts.org/images/products/…/front_xx.N.full.jpg`) у 576 товаров, где сейчас фото нет.
Файлы никуда не копируются (Vercel Blob не нужен). Источник, авторы и лицензия CC BY-SA 3.0 записываются в
`catalog_photo_results` (`storage = 'external_url'`), каждое изменение — в `catalog_photo_changes`
(`run_id = 'openfacts-external-2026-11-19'`) для отката.

| Файл | Что это |
|---|---|
| `openfacts_approved_photos.csv` | 576 одобренных фото: product_id, артикул, название, image_url, источник, авторы, лицензия, SHA-256 (UTF-8, без BOM) |
| `01_create_import_table.sql` | таблица для загрузки CSV `public.catalog_photo_import_openfacts` |
| `02_copy_command.txt` | однострочная команда `\copy` для psql в Windows |
| `03_check_import.sql` | проверки, ничего не меняет |
| `04_apply_import.sql` | применение, одна транзакция |
| `05_rollback_import.sql` | откат именно этого импорта |

## Перед импортом: деплой

Импорт выполняется **после** деплоя ветки с этим кодом на production. Сборка Vercel запускает
`prisma migrate deploy`: добавляются колонки `storage`, `published_image_url` и проверки в `catalog_photo_results`,
сайт начинает показывать подпись CC BY-SA под такими фото и уменьшать большие оригиналы через next/image.
Без деплоя `04_apply_import.sql` остановится с ошибкой и ничего не изменит.

## Шаги

1. Скопировать все файлы этой папки в `C:\salamat\` (путь без пробелов и кириллицы).
2. Открыть «Командную строку» и подключиться к production Neon:
   ```
   chcp 65001
   psql "postgresql://<user>:<password>@<host>/<db>?sslmode=require"
   ```
3. В psql:
   ```
   \i 'C:/salamat/01_create_import_table.sql'
   ```
4. Вставить одной строкой команду из `02_copy_command.txt` — psql ответит `COPY 576`.
5. Проверить:
   ```
   \i 'C:/salamat/03_check_import.sql'
   ```
   Ожидается: все четыре флага в первой таблице `t`; `staged = 576`, `ready_to_apply = 576` (меньше — если кто-то
   уже добавил фото товару или изменил название/артикул: такие строки перечислены во второй таблице и будут
   пропущены), `already_applied_by_this_run = 0`.
6. Применить:
   ```
   \i 'C:/salamat/04_apply_import.sql'
   ```
   В конце четыре одинаковых числа (`planned`, `image_url_filled`, `audit_rows_published`, `image_url_matches_csv`)
   и `COMMIT`. При любой ошибке транзакция откатывается целиком.
7. Проверить на сайте, например
   https://salamat-pharmacy.vercel.app/catalog/item/1417 — фото и подпись
   «Фото: Open Beauty Facts contributors, CC BY-SA 3.0» со ссылкой на страницу товара в Open Beauty Facts.
8. Удалить таблицу загрузки (журнал для отката остаётся в `catalog_photo_changes`):
   ```
   DROP TABLE public.catalog_photo_import_openfacts;
   ```

## Откат

```
\i 'C:/salamat/05_rollback_import.sql'
```
Возвращает прежнее (пустое) значение `image_url` только там, где всё ещё стоит ссылка этого импорта. Фото, которые
после импорта заменили вручную, не трогаются (они перечислены в выводе).

## Правила импорта

- связь по `product_id`; дополнительно совпадают артикул (`btrim`) и название (без учёта лишних пробелов);
- `image_url` заполняется только если он пустой (`NULLIF(BTRIM(image_url), '') IS NULL`), существующие фото,
  в том числе 4 276 уже заполненных (фото NCT и др.), не перезаписываются; другие колонки товара не меняются;
- ссылка — только `https://images.open(food|beauty|products)facts.org/images/products/…` без параметров;
- лицензия `CC BY-SA 3.0`, `rights_status = licensed_cc_by_sa`, статус совпадения confirmed или probable,
  одобрено человеком; товары, отклонённые в `catalog_photo_results`, пропускаются;
- предыдущее значение `image_url` каждого товара сохраняется в `catalog_photo_changes`.
