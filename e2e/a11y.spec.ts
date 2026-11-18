import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/", "/catalog/lekarstvennye-sredstva", "/product/paratsetamol-demo-farma?sku=paratsetamol-500-mg-20-tabl", "/pharmacies", "/cart", "/checkout", "/help", "/kk", "/en", "/en/catalog", "/en/cart", "/admin/login"];

for (const path of pages) {
  test(`a11y: no WCAG 2.1 AA violations on ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
