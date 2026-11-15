import { expect, test } from "@playwright/test";
import { db, loginAdmin, resetLimits } from "./helpers";

test.beforeEach(resetLimits);

test("14. signed-out visitors cannot open the admin panel or admin APIs", async ({ page, request }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await request.get("/api/admin/export")).status()).toBe(403);
  // A forged cookie is not a session.
  await page.context().addCookies([{ name: "salamat_admin", value: "forged", url: "http://localhost:3100" }]);
  await page.goto("/admin/staff");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("15. an operator cannot manage staff and roles", async ({ page }) => {
  await loginAdmin(page, "operator@salamat.local");
  await expect(page.getByRole("navigation", { name: "Разделы админ-панели" }).first()).not.toContainText("Сотрудники");
  await page.goto("/admin/staff");
  await expect(page).toHaveURL(/denied=1/);
  await expect(page.locator("main")).toContainText("Недостаточно прав");
  expect((await page.request.get("/api/admin/export")).status()).toBe(403);
});

test("16-17. import adds products, re-import makes no duplicates, bad rows go to the report", async ({ page }) => {
  await loginAdmin(page, "catalog@salamat.local");
  const stamp = new Date(Date.now() - 3600_000).toISOString();
  const csv = [
    "external_id,product_name,full_variant_name,brand,form,pharmacy_code,price_kzt,stock_quantity,updated_at",
    `E2E-1,Импортин,Импортин 10 мг №20 табл.,Тест Импорт,таблетки,SAL-01,1500,7,${stamp}`,
    `E2E-2,Импортин,Импортин 20 мг №20 табл.,Тест Импорт,таблетки,SAL-01,2500,3,${stamp}`,
    `E2E-3,Импортин,Импортин ошибка,Тест Импорт,таблетки,SAL-01,дорого,1,${stamp}`,
  ].join("\n");
  const upload = async () => {
    await page.goto("/admin/import");
    await page.setInputFiles("input[type=file]", { name: "e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByLabel("Код источника").fill("e2e-src");
    await page.getByRole("button", { name: "Проверить файл" }).click();
    await page.waitForURL(/\/admin\/import\/c/);
  };
  await upload();
  await expect(page.locator("main")).toContainText("INVALID_PRICE");
  page.once("dialog", (d) => d.accept()); // confirmation: rejected rows will not be loaded
  await page.getByRole("button", { name: /^Применить/ }).click();
  await expect(page.locator("main")).toContainText("Добавлено SKU", { timeout: 20_000 }); // the page switches to the "applied" state
  expect(await db.productVariant.count({ where: { externalId: { in: ["E2E-1", "E2E-2"] } } })).toBe(2);
  expect(await db.productVariant.count({ where: { externalId: "E2E-3" } })).toBe(0);
  const report = await page.request.get(page.url().replace(/\/admin\/import\/(\w+)$/, "/api/admin/import/$1/report"));
  expect(await report.text()).toContain("INVALID_PRICE");

  await upload();
  await expect(page.getByText("Будет добавлено").locator("..")).toContainText("0");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /^Применить/ }).click();
  await expect(page.locator("main")).toContainText("Добавлено SKU", { timeout: 20_000 }); // the page switches to the "applied" state
  expect(await db.productVariant.count({ where: { externalId: { in: ["E2E-1", "E2E-2"] } } })).toBe(2);
  // New products stay drafts until published after review.
  const p = await db.product.findFirstOrThrow({ where: { name: "Импортин" } });
  expect(p.publicationStatus).toBe("DRAFT");
});
