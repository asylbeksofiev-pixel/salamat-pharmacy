import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/", "/catalog", "/catalog?hasPhoto=1&sort=name_desc", "/search?q=%D0%B1%D0%B8%D0%BD%D1%82", "/kk/catalog", "/catalog/lekarstvennye-sredstva", "/product/paratsetamol-demo-farma?sku=paratsetamol-500-mg-20-tabl", "/pharmacies", "/cart", "/checkout", "/help", "/kk", "/en", "/en/catalog", "/en/cart", "/catalog/item/7", "/kk/catalog/item/7", "/admin/login"];

for (const path of pages) {
  test(`a11y: no WCAG 2.1 AA violations on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
