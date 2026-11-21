import { expect, test } from "@playwright/test";

test("search history: saved after a search, shown on an empty field after reload, repeat, remove one, clear", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").getByRole("combobox");
  await header.fill("бинт");
  await header.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=%D0%B1%D0%B8%D0%BD%D1%82/);
  await page.reload();
  const field = page.locator("main").getByRole("searchbox");
  await field.fill("");
  await field.focus();
  const history = page.locator("main").getByRole("group", { name: "Недавние запросы" });
  await expect(history).toBeVisible();
  await expect(history.getByRole("button", { name: "Повторить поиск: бинт" })).toBeVisible();
  // A repeated query with other case and spaces does not make a second entry; it moves to the top.
  await field.fill("Аспирин");
  await field.press("Enter");
  await expect(page).toHaveURL(/q=%D0%90%D1%81%D0%BF%D0%B8%D1%80%D0%B8%D0%BD/);
  const again = page.locator("main").getByRole("searchbox");
  await again.fill("  БИНТ ");
  await again.press("Enter");
  await expect(page).toHaveURL(/q=%D0%91%D0%98%D0%9D%D0%A2/);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("salamat_search_history_v1"))) ?? "[]")).toEqual(["БИНТ", "Аспирин"]);
  // Keyboard: ↓ moves into the list, Escape closes it and returns to the field.
  const f = page.locator("main").getByRole("searchbox");
  await f.fill("");
  await f.focus();
  await f.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Повторить поиск: БИНТ" }).last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(f).toBeFocused();
  await expect(page.locator("main [data-search-history]")).toBeHidden();
  // Repeat a search by clicking it, remove one entry, clear all.
  await f.click();
  await page.locator("main").getByRole("button", { name: "Повторить поиск: Аспирин" }).click();
  await expect(page).toHaveURL(/q=%D0%90%D1%81%D0%BF%D0%B8%D1%80%D0%B8%D0%BD/);
  const g = page.locator("main").getByRole("searchbox");
  await g.fill("");
  await g.click();
  await page.locator("main").getByRole("button", { name: "Удалить «БИНТ» из истории" }).click();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("salamat_search_history_v1"))) ?? "[]")).toEqual(["Аспирин"]);
  await page.locator("main").getByRole("button", { name: "Очистить историю" }).click();
  expect(await page.evaluate(() => localStorage.getItem("salamat_search_history_v1"))).toBe("[]");
  // Damaged storage does not break the page.
  await page.evaluate(() => localStorage.setItem("salamat_search_history_v1", "{oops"));
  await page.reload();
  await page.locator("main").getByRole("searchbox").focus();
  await expect(page.locator("main [data-search-history]")).toBeHidden();
});

test("typo: nothing found, 'Did you mean' link searches the corrected query; an article is never corrected", async ({ page }) => {
  await page.goto("/search?q=" + encodeURIComponent("аспирн"));
  const hint = page.getByTestId("did-you-mean");
  await expect(hint).toContainText("Возможно, вы искали:");
  await expect(page.locator("main h1")).toContainText("аспирн");
  await hint.getByRole("link", { name: "Искать «аспирин»" }).click();
  await expect(page).toHaveURL(/q=%D0%B0%D1%81%D0%BF%D0%B8%D1%80%D0%B8%D0%BD$/);
  await expect(page.locator("main article").first()).toContainText("Аспирин Кардио");
  await page.goto("/search?q=999999999");
  await expect(page.getByTestId("did-you-mean")).toHaveCount(0);
});
