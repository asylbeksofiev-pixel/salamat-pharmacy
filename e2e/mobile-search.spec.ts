import { expect, test, type Page } from "@playwright/test";
import { resetLimits } from "./helpers";

test.beforeEach(resetLimits);

const HISTORY_KEY = "salamat_search_history_v1";
const phone = { hasTouch: true, isMobile: true } as const;

const storedHistory = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as { q: string; at: number }[] | null, HISTORY_KEY);

test("phones: no horizontal page overflow and no form field that makes iOS zoom in", async ({ browser }) => {
  // iOS Safari zooms into a field whose text is smaller than 16px and keeps the zoom; after that every vertical
  // swipe also slides the whole page sideways. Fields must be at least 16px on phones.
  for (const width of [320, 360, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 760 }, ...phone });
    const page = await ctx.newPage();
    for (const path of ["/", "/catalog", "/search?q=аспирин", "/pharmacies", "/kk", "/en/catalog?q=DUP-001"]) {
      await page.goto(path);
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => requestAnimationFrame(r));
        }
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on ${path} at ${width}px`).toBeLessThanOrEqual(0);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLInputElement>("input, select, textarea")]
          .filter((e) => e.getClientRects().length > 0 && !["checkbox", "radio", "hidden"].includes(e.type))
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
          .map((e) => e.name || e.id),
      );
      expect(small, `fields under 16px on ${path} at ${width}px`).toEqual([]);
    }
    await ctx.close();
  }
});

test("search history: only submitted queries, kept after reload, shown on request, repeat and clear", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, ...phone });
  const page = await ctx.newPage();
  await page.goto("/");
  const box = page.locator("header").getByRole("combobox").filter({ visible: true });

  // Typing and suggestions are not history.
  await box.fill("параЦ");
  await expect(page.getByRole("listbox").filter({ visible: true })).toContainText("Парацетамол 500 мг №20 табл.");
  expect(await storedHistory(page)).toBeNull();

  // Submitted queries are, newest first, with the time; the same query again moves up instead of repeating.
  await box.fill("аспирин");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=/);
  await box.fill("но-шпа");
  await box.press("Enter");
  await expect(page).toHaveURL(/q=%D0%BD%D0%BE/);
  await box.fill("  Аспирин ");
  await box.press("Enter");
  await expect(page).toHaveURL(/q=%D0%90/);
  const saved = (await storedHistory(page))!;
  expect(saved.map((e) => e.q)).toEqual(["Аспирин", "но-шпа"]);
  expect(saved[0].at).toBeGreaterThanOrEqual(saved[1].at);

  // After a reload the history is still there, but only shown after an explicit tap.
  await page.reload();
  await box.fill("");
  await box.focus();
  const show = page.getByRole("button", { name: "Показать историю поиска (2)" }).filter({ visible: true });
  await expect(show).toBeVisible();
  const header = page.locator("header");
  await expect(header.getByRole("button", { name: /но-шпа/ }).filter({ visible: true })).toHaveCount(0);
  await show.click();
  const region = header.getByRole("region", { name: "История поиска" }).filter({ visible: true });
  await expect(region.locator("time")).toHaveCount(2);

  // A tap repeats the search.
  await region.getByRole("button", { name: /но-шпа/ }).click();
  await expect(page).toHaveURL(/q=%D0%BD%D0%BE/);
  expect((await storedHistory(page))!.map((e) => e.q)).toEqual(["но-шпа", "Аспирин"]);

  // Clearing removes everything and says so.
  await box.fill("");
  await box.focus();
  await page.getByRole("button", { name: /Показать историю поиска/ }).filter({ visible: true }).click();
  await header.getByRole("button", { name: "Очистить историю" }).filter({ visible: true }).click();
  await expect(header.getByText("История поиска очищена.").filter({ visible: true })).toBeVisible();
  expect(await storedHistory(page)).toBeNull();
  await ctx.close();
});

test("search history: a clear message when the browser refuses to store it", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, ...phone });
  await ctx.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  const page = await ctx.newPage();
  await page.goto("/en");
  const box = page.locator("header").getByRole("combobox").filter({ visible: true });
  await box.fill("ibuprofen");
  await box.press("Enter");
  // The search itself works; the visitor is told the history was not saved.
  await expect(page).toHaveURL(/\/en\/search\?q=ibuprofen/);
  await expect(page.locator(".anim-toast")).toContainText("Couldn’t save this search to your history");
  await ctx.close();
});
