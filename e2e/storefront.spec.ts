import { expect, test } from "@playwright/test";
import { PRODUCT, db, resetLimits, selectPharmacy } from "./helpers";

test.beforeEach(resetLimits);

test("1. home page opens without errors on mobile, tablet and desktop", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

test("2. logo, menu and footer links lead to existing pages", async ({ page, request }) => {
  await page.goto("/catalog");
  await page.getByRole("link", { name: /SALAMAT — Главная/ }).click();
  await expect(page).toHaveURL(/\/$/);
  const hrefs = await page.locator("header a[href^='/'], footer a[href^='/'], main a[href^='/']").evaluateAll((els) => Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!))));
  expect(hrefs.length).toBeGreaterThan(20);
  for (const href of hrefs) {
    const r = await request.get(href);
    expect(r.status(), href).toBeLessThan(400);
  }
});

test("3-4. search finds by part of the name and keeps dosages apart", async ({ page }) => {
  await page.goto("/");
  const box = page.getByRole("combobox").first();
  await box.fill("параЦ");
  await expect(page.getByRole("listbox")).toContainText("Парацетамол 500 мг №20 табл.");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  // Wait for the results to stream in before reading them.
  await expect(page.locator("main")).toContainText("Найдено товаров: 3");
  await expect(page.locator("main article h3")).toHaveCount(3);
  const titles = await page.locator("main article h3").allTextContents();
  expect(titles.sort()).toEqual(["ПАРАЦЕТАМОЛ 200 мг №10 табл.", "Парацетамол 500 мг №10 табл.", "Парацетамол 500 мг №20 табл."].sort());
});

test("catalogue: totals, pagination, item by id, same article stays separate, no invented prices", async ({ page }) => {
  const total = Number((await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.pharmacy_products`)[0].n);
  await page.goto("/catalog");
  await expect(page.locator("main")).toContainText(`Товаров: ${total}`);
  const page1 = await page.locator("main article").evaluateAll((els) => els.map((e) => e.getAttribute("data-item-id")));
  expect(page1).toHaveLength(24);
  await page.getByRole("navigation", { name: "Страницы" }).getByRole("link", { name: /Далее/ }).click();
  await expect(page).toHaveURL(/page=2/);
  const page2 = await page.locator("main article").evaluateAll((els) => els.map((e) => e.getAttribute("data-item-id")));
  expect(page2).toHaveLength(24);
  expect(page1.filter((id) => page2.includes(id))).toEqual([]);
  // No fake prices or stock for products without data; they can still go into a request "to be confirmed".
  const main = page.locator("main");
  await expect(main).not.toContainText(/\b0\s?₸/);
  await expect(main).not.toContainText("Есть в наличии");
  await expect(main.locator("article").first()).toContainText("Цена уточняется");
  await expect(main.getByRole("button", { name: "В корзину" })).toHaveCount(24);
  // Same article → two separate cards, each opening its own id.
  await page.goto("/catalog?q=DUP-001");
  await expect(main).toContainText("Найдено товаров: 2");
  const ids = await main.locator("article").evaluateAll((els) => els.map((e) => e.getAttribute("data-item-id")));
  expect(new Set(ids).size).toBe(2);
  await main.getByRole("link", { name: "Бинт стерильный 7 м × 14 см" }).click();
  await expect(page).toHaveURL(new RegExp(`/catalog/item/(${ids.join("|")})$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Бинт стерильный 7 м × 14 см");
  await expect(main).toContainText("Артикул: DUP-001");
  await expect(main).toContainText("Цена уточняется");
  await expect(main).toContainText("Наличие уточняется");
  // Unknown id → 404, empty search → clear empty state.
  expect((await page.goto("/catalog/item/999999999999"))?.status()).toBe(404);
  await page.goto("/catalog?q=zzzzqqqq");
  await expect(main).toContainText("ничего не найдено");
});

test("favourites: the heart on a catalogue card saves the product and the favourites page shows it", async ({ page }) => {
  await page.goto("/catalog?q=DUP-001");
  const main = page.locator("main");
  await expect(main).toContainText("Найдено товаров: 2");
  const card = main.locator("article").first();
  const id = await card.getAttribute("data-item-id");
  const name = (await card.locator("h3").textContent())?.trim() ?? "";
  await card.getByRole("button", { name: "Добавить в избранное" }).click();
  await expect(card.getByRole("button", { name: "Убрать из избранного" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/favorites");
  await expect(main.locator(`article[data-item-id="${id}"]`)).toBeVisible();
  await expect(main.locator(`article[data-item-id="${id}"] h3`)).toHaveText(name);
  await main.getByRole("button", { name: "Убрать из избранного" }).click();
  await expect(main).toContainText("В избранном пока ничего нет");
});

test("branches: closed ones are gone, new ones are listed and mapped, nearest pharmacy is found", async ({ page, context }) => {
  await page.goto("/pharmacies");
  const main = page.locator("main");
  await expect(main).toContainText("Аптек: 17");
  await expect(main.locator("article")).toHaveCount(17);
  await expect(main).not.toContainText("д. 36, н.п. 8");
  await expect(main).not.toContainText("д. 49, н.п. 1");
  for (const a of ["пр. Мәңгілік Ел, д. 24", "ул. Ж. Нажимеденова, д. 13", "ул. Есет батыра, д. 11 (Ильинка 2)", "с. Жибек Жолы, ул. Курманова, д. 8/3", "пр. Туран, д. 55, н.п. 8"]) {
    await expect(main).toContainText(a);
  }
  const card24 = main.locator("article", { hasText: "пр. Мәңгілік Ел, д. 24" });
  await expect(card24).toContainText("8 (702) 531 44 85");
  await expect(main.locator('a[href="tel:+77025314485"]')).toHaveCount(1);
  // The placeholder phone from the branch file is never shown.
  await expect(main.locator('a[href="tel:+77000000000"]')).toHaveCount(0);
  await expect(main.locator("article", { hasText: "пр. Туран" })).toContainText("Телефон уточняется");
  // Every listed branch has a marker; closed branch pages are gone.
  await expect(page.locator(".sal-pin")).toHaveCount(17);
  expect((await page.goto("/pharmacies/mangilik-el-49"))?.status()).toBe(404);
  // Geolocation: the visitor stands next to пр. Мәңгілік Ел, 24.
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 51.115, longitude: 71.433 });
  await page.goto("/pharmacies");
  await page.getByRole("button", { name: "Найти ближайшую аптеку" }).click().catch(() => undefined);
  const nearestBox = page.locator("section[aria-labelledby=nearest-title]");
  await expect(nearestBox).toContainText("пр. Мәңгілік Ел, д. 24");
  await expect(nearestBox).toContainText("8 (702) 531 44 85");
  await expect(page.locator(".sal-me-label")).toHaveText("Вы здесь");
  await expect(page.locator(".leaflet-popup-content")).toContainText("Построить маршрут");
});

test("catalogue API never exposes database credentials", async ({ request }) => {
  const res = await request.get("/api/catalog/items?q=%D0%BF%D0%B0%D1%80%D0%B0&pageSize=500");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.pageSize).toBe(48);
  expect(body.items.length).toBe(3);
  expect(JSON.stringify(body)).not.toMatch(/postgres|DATABASE_URL|password/i);
  expect((await request.get("/api/catalog/items/abc")).status()).toBe(400);
});

test("5. filters apply and are kept in the URL", async ({ page }) => {
  await page.goto("/catalog/lekarstvennye-sredstva");
  const sidebar = page.getByRole("complementary", { name: "Фильтры" });
  await sidebar.getByLabel("Пример Лаб").check();
  await expect(page).toHaveURL(/brand=primer-lab/);
  const titles = await page.locator("main article h3").allTextContents();
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.every((t) => /Ибупрофен|Амоксициллин/.test(t))).toBe(true);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "Фильтры" }).getByLabel("Пример Лаб")).toBeChecked();
  await page.getByLabel("Сортировка").selectOption("name_desc");
  await expect(page).toHaveURL(/sort=name_desc/);
  await expect(page).toHaveURL(/brand=primer-lab/);
});

test("6-8. pharmacy choice drives price and availability; no 0 ₸, no fake stock", async ({ page }) => {
  await page.goto(`${PRODUCT}?sku=paratsetamol-500-mg-20-tabl`);
  const offer = page.getByRole("region", { name: "Цена в аптеке" });
  await expect(offer.getByRole("button", { name: "Выбрать аптеку", exact: true })).toBeVisible();
  await selectPharmacy(page, /Асфендиярова/);
  await expect(offer).toContainText("450");
  await expect(offer).toContainText("Есть в наличии");
  await selectPharmacy(page, /Майлина/);
  await expect(offer).toContainText("470");

  await selectPharmacy(page, /Асфендиярова/);
  await page.goto(`${PRODUCT}?sku=paratsetamol-200-mg-10-tabl`);
  await expect(offer).toContainText("Цена уточняется");
  await expect(offer).toContainText("Наличие уточняется");
  await expect(offer).not.toContainText(/\b0\s?₸/);
  await expect(offer.getByRole("button", { name: "Уточнить наличие" })).toBeVisible();

  await page.goto("/product/ibuprofen-primer-lab?sku=ibuprofen-200-mg-20-tabl-p-o");
  await expect(offer).toContainText("520");
  await expect(offer).toContainText("Наличие уточняется");
  await expect(offer).not.toContainText("Есть в наличии");
});

test("9-10. cart survives reload and quantity recalculates the total", async ({ page }) => {
  await page.goto("/");
  await selectPharmacy(page, /Асфендиярова/);
  await page.goto(`${PRODUCT}?sku=paratsetamol-500-mg-20-tabl`);
  await page.getByRole("region", { name: "Цена в аптеке" }).getByRole("button", { name: "В корзину" }).click();
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: /Корзина/ })).toBeVisible();
  await page.reload();
  await expect(page.locator("main")).toContainText("Парацетамол 500 мг №20 табл.");
  const summary = page.locator("aside").first();
  await expect(summary).toContainText(/450\s₸/);
  await page.getByRole("button", { name: "Увеличить количество" }).first().click();
  await expect(summary).toContainText(/900\s₸/);
});

test("11-13. checkout re-checks prices, saves one request, operator sees it", async ({ page, browser }) => {
  await page.goto("/");
  await selectPharmacy(page, /Асфендиярова/);
  await page.goto(`${PRODUCT}?sku=paratsetamol-500-mg-10-tabl`);
  await page.getByRole("region", { name: "Цена в аптеке" }).getByRole("button", { name: "В корзину" }).click();
  // Price changes after the item was added.
  const v = await db.productVariant.findFirstOrThrow({ where: { externalId: "D-0002" } });
  const ph = await db.pharmacy.findUniqueOrThrow({ where: { code: "SAL-01" } });
  await db.price.update({ where: { variantId_pharmacyId: { variantId: v.id, pharmacyId: ph.id } }, data: { priceKzt: 290, sourceUpdatedAt: new Date() } });

  await page.goto("/checkout");
  await expect(page.locator("aside")).toContainText(/290\s₸/);
  await expect(page.locator("main")).toContainText("Цена изменилась");
  const name = `E2E ${Date.now()}`;
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Телефон").fill("87011234567");
  await page.locator("input[name=consent]").check();
  const submit = page.getByRole("button", { name: "Отправить заявку" });
  await submit.dblclick();
  await page.waitForURL(/\/order\/success\/S-/);
  await expect(page.locator("main")).toContainText("Заявка отправлена");
  await expect(page.locator("main")).toContainText("оператор");
  const publicId = page.url().split("/").pop()!;
  expect(await db.order.count({ where: { customerName: name } })).toBe(1);
  const saved = await db.order.findUniqueOrThrow({ where: { publicId }, include: { items: true } });
  expect(saved.items[0].unitPriceKzt).toBe(290);

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  const { loginAdmin } = await import("./helpers");
  await loginAdmin(admin, "operator@salamat.local");
  await admin.goto("/admin/orders");
  await expect(admin.getByRole("link", { name: publicId })).toBeVisible();
  await admin.getByRole("link", { name: publicId }).click();
  await expect(admin.locator("main")).toContainText(name);
  await admin.getByLabel("Новый статус").selectOption("PROCESSING");
  await admin.getByRole("button", { name: "Применить" }).click();
  await expect(admin.locator("main")).toContainText("Статус: В обработке");
  await ctx.close();
});

test("13b. the same idempotency key never creates a second request", async ({ request }) => {
  const v = await db.productVariant.findFirstOrThrow({ where: { externalId: "D-0003" } });
  const ph = await db.pharmacy.findUniqueOrThrow({ where: { code: "SAL-01" } });
  const body = { idempotencyKey: crypto.randomUUID(), pharmacyId: ph.id, fulfillment: "PICKUP", name: "Дубль", phone: "+77017654321", consent: true, locale: "ru", items: [{ variantId: v.id, quantity: 1, seenPriceKzt: 450 }] };
  const headers = { Origin: "http://localhost:3100" };
  const [a, b] = await Promise.all([request.post("/api/orders", { data: body, headers }), request.post("/api/orders", { data: body, headers })]);
  const ids = [(await a.json()).publicId, (await b.json()).publicId];
  expect(ids[0]).toBeTruthy();
  expect(ids[0]).toBe(ids[1]);
  expect(await db.order.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
});

test("18. expired promotions are not shown as active", async ({ page }) => {
  await page.goto("/promotions");
  await expect(page.locator("main")).toContainText("Демо: бонус за витамин D3");
  await expect(page.locator("main")).not.toContainText("завершённая скидка");
  await page.goto("/promotions/demo-expired-discount");
  await expect(page.locator("main")).toContainText("Акция завершена");
  await page.goto("/product/magniy-b6-test-natural");
  await expect(page.locator("main")).not.toContainText("−10%");
});

test("19. RU/KZ switching keeps the language while navigating", async ({ page }) => {
  await page.goto("/catalog");
  await page.getByRole("group", { name: "Язык" }).getByRole("link", { name: /Қазақша/ }).click();
  await expect(page).toHaveURL(/\/kk\/catalog$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk-KZ");
  await expect(page.locator("header")).toContainText("Дәріханалар");
  await page.locator("header").getByRole("link", { name: "Акциялар" }).click();
  await expect(page).toHaveURL(/\/kk\/promotions$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Акциялар");
  await page.goto("/");
  await expect(page).toHaveURL(/\/kk$/); // remembered choice
  await page.getByRole("group", { name: "Тіл" }).getByRole("link", { name: /Русский/ }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru-KZ");
});

test("buttons keep working before JavaScript has loaded (slow networks)", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/");
  // "Choose pharmacy" opens the pharmacy list instead of doing nothing.
  await page.locator("header").getByRole("button", { name: /Выбрать аптеку/ }).first().click();
  await expect(page).toHaveURL(/\/pharmacies$/);
  // "Select" sets the pharmacy with a plain form post and returns to the same page.
  await page.getByRole("article").filter({ hasText: "Майлина" }).getByRole("button", { name: "Выбрать" }).click();
  await expect(page).toHaveURL(/\/pharmacies$/);
  await expect(page.locator("header")).toContainText("Майлина");
  // Catalogue button and search form.
  await page.locator("header").getByRole("button", { name: "Каталог" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.locator("header").getByRole("combobox").fill("парацетамол");
  await page.locator("header").getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
  // Results are in the server HTML (revealed by a tiny inline script when JavaScript is on).
  expect(await page.content()).toContain("Парацетамол 500 мг №20 табл.");
  await ctx.close();
});

test("request 'to be confirmed': catalogue product → cart → checkout → saved without a price → operator sees it", async ({ page, browser }) => {
  await page.goto("/");
  // Home: no search inside the hero, catalogue preview with real cards and a way into the catalogue.
  await expect(page.locator("section").first().getByRole("search")).toHaveCount(0);
  const catalog = page.getByRole("region", { name: "Каталог товаров" });
  // Carousel: up to 12 real products in a stable order; "next" scrolls, "previous" is disabled at the start.
  await expect(catalog.locator("article")).toHaveCount(12);
  await expect(catalog.getByRole("button", { name: "Предыдущие товары" })).toBeDisabled();
  await catalog.getByRole("button", { name: "Следующие товары" }).click();
  await expect(catalog.getByRole("button", { name: "Предыдущие товары" })).toBeEnabled();
  await expect(catalog.getByRole("link", { name: "Смотреть все товары" })).toHaveAttribute("href", "/catalog");
  await selectPharmacy(page, /Асфендиярова/);
  await page.goto("/catalog?q=ASP-100");
  const card = page.locator("main article").first();
  await card.getByRole("button", { name: "В корзину" }).click();
  await expect(card.getByRole("link", { name: "В корзине" })).toBeVisible();
  await page.goto("/cart");
  await expect(page.locator("main")).toContainText("Заявка на уточнение");
  await expect(page.locator("main")).toContainText("Артикул: ASP-100");
  await expect(page.locator("main")).toContainText("Цену уточнит аптека");
  await expect(page.locator("main")).not.toContainText(/\d\s₸/);
  await page.getByRole("link", { name: "Перейти к оформлению" }).click();
  const name = `E2E catalog ${Date.now()}`;
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Телефон").fill("87011234567");
  await page.locator("input[name=consent]").check();
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await page.waitForURL(/\/order\/success\/S-/);
  expect(page.url()).not.toContain("87011234567");
  const publicId = page.url().split("/").pop()!;
  const saved = await db.order.findUniqueOrThrow({ where: { publicId }, include: { items: true } });
  expect(saved.totalKzt).toBeNull();
  expect(saved.items[0]).toMatchObject({ variantId: null, skuSnapshot: "ASP-100", unitPriceKzt: null });

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  const { loginAdmin } = await import("./helpers");
  await loginAdmin(admin, "operator@salamat.local");
  await admin.goto(`/admin/orders/${saved.id}`);
  await expect(admin.locator("main")).toContainText("Артикул: ASP-100");
  await expect(admin.locator("main")).toContainText("Заявка на уточнение");
  await ctx.close();
});

test("English version: /en routes, switcher keeps the page and query, no Russian interface text", async ({ page }) => {
  await page.goto("/catalog?q=DUP-001");
  await page.getByRole("group", { name: "Язык" }).getByRole("link", { name: /English/ }).click();
  await expect(page).toHaveURL(/\/en\/catalog\?q=DUP-001$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const main = page.locator("main");
  await expect(main).toContainText("Products found: 2");
  await expect(main.locator("article").first()).toContainText("Price to be confirmed");
  await expect(main.getByRole("button", { name: "Add to cart" })).toHaveCount(2);
  await expect(page.locator("header")).toContainText("Pharmacies");
  await expect(page.locator("header")).not.toContainText("Аптеки");
  // Product names stay in the original language and are marked as Russian for screen readers.
  await expect(main.locator("article h3").first()).toHaveAttribute("lang", "ru");
  for (const path of ["/en", "/en/cart", "/en/pharmacies", "/en/help"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("header")).not.toContainText(/Корзина|Каталог|Справочная/);
    await expect(page.locator("footer")).toContainText("All rights reserved.");
  }
  // hreflang alternates list all three languages.
  await page.goto("/en/pharmacies");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/pharmacies$/);
  await expect(page.locator('link[rel="alternate"][hreflang="kk-KZ"]')).toHaveAttribute("href", /\/kk\/pharmacies$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/); // remembered choice
});
