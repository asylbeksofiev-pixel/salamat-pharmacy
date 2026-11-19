import { expect, test } from "@playwright/test";
import { db, resetLimits } from "./helpers";

// Sections for a few fixture products (public.pharmacy_products), written like the classification script does,
// then removed again so other specs see the catalogue without sections.
async function classify() {
  const devices = await db.category.findUniqueOrThrow({ where: { slug: "medicinskie-pribory-i-izdeliya" } });
  const hygiene = await db.category.findUniqueOrThrow({ where: { slug: "gigiena" } });
  const rows = await db.$queryRaw<{ id: bigint; name: string }[]>`SELECT id, name FROM public.pharmacy_products WHERE name LIKE 'Бинт%' OR name LIKE 'Ёлочный%'`;
  for (const r of rows) {
    const cat = r.name.startsWith("Бинт") ? devices : hygiene;
    await db.catalogItemCategory.create({ data: { productId: r.id, categoryId: cat.id, confidence: 0.9, method: "rule:e2e", reason: "e2e", reviewStatus: "auto", classifierVersion: "e2e" } });
  }
  return rows.filter((r) => r.name.startsWith("Бинт")).length;
}

test.beforeEach(async () => {
  await resetLimits();
  await db.catalogItemCategory.deleteMany();
});
test.afterEach(async () => {
  await db.catalogItemCategory.deleteMany();
});

test("catalogue sections and filters: URL state, chips, reset, Back/Forward, reload, language", async ({ page }) => {
  const bandages = await classify();
  await page.goto("/catalog");
  const aside = page.locator("aside");
  await expect(aside.getByText("Разделы")).toBeVisible();
  await aside.getByLabel(/Медицинские приборы и изделия/).check();
  await expect(page).toHaveURL(/category=medicinskie-pribory-i-izdeliya/);
  const main = page.locator("main");
  await expect(main).toContainText(`Найдено товаров: ${bandages}`);
  await expect(main.locator("article")).toHaveCount(bandages);
  const chips = page.getByRole("group", { name: "Выбранные фильтры" });
  await expect(chips).toContainText("Медицинские приборы и изделия");

  // Several sections: OR.
  await aside.getByLabel(/Гигиена/).check();
  await expect(page).toHaveURL(/gigiena/);
  await expect(main).toContainText(`Найдено товаров: ${bandages + 1}`);

  // Reload keeps the state; Back returns to the previous filter set.
  await page.reload();
  await expect(main).toContainText(`Найдено товаров: ${bandages + 1}`);
  await page.goBack();
  await expect(page).not.toHaveURL(/gigiena/);
  await expect(main).toContainText(`Найдено товаров: ${bandages}`);
  await page.goForward();
  await expect(page).toHaveURL(/gigiena/);

  // Photo filter is AND; with no photos in the fixture it gives an empty state with a reset action.
  await aside.getByLabel("Только с фото").check();
  await expect(main).toContainText("Ничего не найдено");
  await chips.getByRole("link", { name: /Только с фото/ }).click();
  await expect(page).not.toHaveURL(/hasPhoto/);

  // Category page shows only its products; breadcrumbs include the section.
  await page.goto("/catalog/medicinskie-pribory-i-izdeliya");
  await expect(main.locator("article")).toHaveCount(bandages);
  await expect(page.locator("nav ol").first()).toContainText("Медицинские приборы и изделия");

  // Language switch keeps the filters.
  await page.goto("/catalog?category=gigiena");
  await page.getByRole("group", { name: "Язык" }).getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/en\/catalog\?category=gigiena/);
  await expect(page.locator("main")).toContainText("Hygiene");

  // Reset filters keeps the search text.
  await page.goto("/catalog?q=%D0%B1%D0%B8%D0%BD%D1%82&category=medicinskie-pribory-i-izdeliya&hasPhoto=1");
  await page.getByRole("group", { name: "Выбранные фильтры" }).getByRole("link", { name: "Сбросить фильтры" }).click();
  await expect(page).toHaveURL(/\/catalog\?q=/);
  await expect(page).not.toHaveURL(/category=|hasPhoto/);
});

test("phone: filters and sort in drawers, Escape closes and returns focus, invalid parameters are ignored", async ({ page }) => {
  const bandages = await classify();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog?priceMin=abc&sort=drop&page=-5&category=unknown");
  await expect(page.locator("main")).toContainText("Товаров:");
  const open = page.getByRole("button", { name: /^Фильтры/ });
  await open.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Медицинские приборы и изделия/).check();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await expect(dialog.getByLabel(/Медицинские приборы и изделия/)).toBeChecked();
  await dialog.getByRole("button", { name: "Применить" }).click();
  await expect(page).toHaveURL(/category=medicinskie-pribory-i-izdeliya/);
  await expect(page.locator("main")).toContainText(`Найдено товаров: ${bandages}`);
  await page.getByRole("button", { name: /^Сортировка/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /Сначала популярные/ })).toBeDisabled();
  await page.getByRole("dialog").getByRole("button", { name: "По названию (Я–А)" }).click();
  await expect(page).toHaveURL(/sort=name_desc/);
  await expect(page).toHaveURL(/category=medicinskie-pribory-i-izdeliya/);
});
