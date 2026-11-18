# SALAMAT — сайт аптечной сети

Интернет-витрина аптечной сети SALAMAT (Астана): поиск и каталог аптечных товаров, выбор аптеки, цены и наличие
по филиалам, корзина и заявка на самовывоз без регистрации (для товаров без подтверждённой цены — «заявка на уточнение»), админ-панель с ролями, импорт ассортимента из CSV/XLSX.
Русский, казахский и английский языки.

> Сайт честно показывает отсутствие данных: без выгрузки SALAMAT каталог пуст, цены — «Цена уточняется»,
> наличие — «Наличие уточняется». Демо-товары загружаются только командой `npm run db:demo` и помечаются баннером.

Стек: Next.js 16 (App Router, TypeScript), PostgreSQL 16 + Prisma 6, Tailwind CSS 4, Zod, Vitest, Playwright.

## Быстрый старт (локально)

Нужны Node.js ≥ 20.9 и PostgreSQL 16 (локально или Docker).

```bash
npm install
```

```bash
cp .env.example .env
```

Поднять базу — один из вариантов:

```bash
npm run db:local
```

(скрипт `scripts/db-local.sh` создаёт кластер в `./.pgdata` на порту 5433 и базы `salamat`, `salamat_test`,
`salamat_e2e_test`; работает и от root через пользователя `postgres`) или

```bash
docker compose up -d db
```

(тогда в `.env`: `DATABASE_URL="postgresql://salamat:salamat@127.0.0.1:5433/salamat"`).

Миграции и справочные данные (14 филиалов и 9 категорий с официального сайта, страницы, FAQ, роли, настройки):

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Первый сотрудник (Super Admin). Пароль спрашивается в терминале или берётся из `ADMIN_PASSWORD`:

```bash
npm run admin:create -- --email admin@example.kz --name "Имя Фамилия" --role SUPER_ADMIN
```

Запуск:

```bash
npm run dev
```

Сайт: http://localhost:3000 (казахская версия — http://localhost:3000/kk, английская — http://localhost:3000/en), админ-панель: http://localhost:3000/admin.

### Каталог локально

На production каталог читается из готовой таблицы `public.pharmacy_products`. Для локальной базы создайте её
копию с 128 тестовыми строками (скрипт отказывается работать с нелокальной базой):

```bash
npm run db:catalog-fixture
```

### Демо-данные для разработки

```bash
npm run db:demo
```

Загружает 30 вымышленных SKU (бренды «Демо Фарма», «Пример Лаб» и т. п.) через тот же конвейер импорта, две
демо-акции (действующую и завершённую) и пять демо-сотрудников — по одному на роль:
`admin@`, `operator@`, `catalog@`, `branch@`, `content@salamat.local`, пароль `salamat-demo-2026`
(или `DEMO_STAFF_PASSWORD`). На витрине демо-товары видны только при `SHOW_DEMO_DATA=true`.
Удалить: `npm run db:demo -- --remove`. В production команда отказывается работать.

## Проверки

| Команда | Что проверяет | Результат последнего запуска |
|---|---|---|
| `npm run typecheck` | TypeScript | без ошибок |
| `npm run lint` | ESLint (next/core-web-vitals, react-hooks) | 0 ошибок, 0 предупреждений |
| `npm test` | Vitest: модульные и интеграционные тесты на PostgreSQL (`salamat_test`) | 93/93 |
| `npm run test:e2e` | Playwright на production-сборке с демо-данными (`salamat_e2e_test`, порт 3100): сценарии + 12 проверок axe-core (WCAG 2.1 AA) | 32/32 |
| `npm run build` | production-сборка | успешно |

Тестовые базы пересоздаются при каждом запуске; скрипты отказываются трогать базу, в имени которой нет `test`.
`npm run test:e2e` сам выполняет `next build`, если сборки ещё нет.

Соответствие 20 обязательным сценариям — в `docs/launch-checklist.md`.

## Полезные команды

| Команда | Назначение |
|---|---|
| `npm run import:file -- файл.xlsx [--apply] [--publish]` | импорт большого файла из консоли (тот же конвейер, что в админке) |
| `npm run orders:anonymize` | обезличивание контактов в старых заявках по сроку хранения |
| `npm run templates:build` | пересоздать шаблоны импорта `data/templates/*` |
| `npm run db:migrate:dev` | создать новую миграцию после изменения `prisma/schema.prisma` |

## Структура

```
prisma/              схема, миграции, seed (справочные данные с официального сайта)
data/templates/      шаблон импорта ассортимента (CSV и XLSX с описанием колонок)
scripts/             локальная БД, демо-данные, создание сотрудника, CLI-импорт, обезличивание, e2e-сервер
src/proxy.ts         локали (/ — RU, /kk — KZ, /en — EN), защита /admin
src/app/[locale]/    публичные страницы
src/app/admin/       админ-панель (свой корневой layout, серверные проверки прав)
src/app/api/         подсказки поиска, пересчёт корзины, заявки, выбор аптеки, экспорт, cron
src/server/          работа с БД, бизнес-правила заявок, импорт, авторизация и роли, настройки
src/lib/             чистые функции: правила цены/наличия, поиск, форматирование, i18n
src/components/      UI-компоненты (ui/), витрина (site/, catalog/, checkout/), админка (admin/)
tests/               Vitest (unit, integration)
e2e/                 Playwright
docs/                аудит источников, дизайн-система, архитектура, импорт, чек-лист запуска
```

## Документация

* `docs/source-audit.md` — что подтверждено на salamatfarmacia.kz, i-Teka, Биосфере и Pharmapay, что нужно подтвердить
* `docs/design-system.md` — цвета, типографика, компоненты, состояния
* `docs/architecture.md` — слои, модель данных, безопасность, SEO, развёртывание
* `docs/catalog-products.md` — каталог из таблицы `pharmacy_products`: API, поиск, индексы, будущие столбцы
* `docs/data-import.md` — формат файла, правила сопоставления, API учётной системы
* `docs/launch-checklist.md` — что нужно для запуска и результаты проверок

## Развёртывание (GitHub + Vercel)

1. Загрузить репозиторий на GitHub.
2. В Vercel: **Add New → Project → Import** этого репозитория (настройки сборки берутся из `vercel.json`).
3. В проекте Vercel: **Storage → Create Database → Neon (Postgres)** и подключить к проекту — Vercel сам добавит
   `DATABASE_URL` (пул) и `DATABASE_URL_UNPOOLED` (прямое подключение для миграций).
   Подойдёт и любая другая PostgreSQL 16: тогда задайте `DATABASE_URL` вручную.
4. **Settings → Environment Variables** (Production):
   * `APP_URL` — адрес сайта, например `https://salamat-pharmacy.vercel.app` (позже — свой домен);
   * `APP_SECRET` и `CRON_SECRET` — случайные строки (например, `openssl rand -hex 32`);
   * `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 10 символов, буквы и цифры), `ADMIN_NAME` — первый Super Admin;
   * `ALLOW_INDEXING=true` — только когда сайт готов к запуску; `SHOW_DEMO_DATA` не задавать.
5. **Deployments → Redeploy.** Сборка выполняет `prisma migrate deploy`, затем идемпотентный `prisma db seed`
   (филиалы, категории, страницы, роли, первый администратор; уже существующие записи не перезаписываются) и
   `next build`. Ежедневный cron `/api/cron/retention` обезличивает старые заявки.
6. Войти в `/admin` с `ADMIN_EMAIL`, после этого `ADMIN_PASSWORD` можно удалить из переменных Vercel.

Каждый push в основную ветку GitHub автоматически публикует новую версию.
