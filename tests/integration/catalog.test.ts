import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listVariants, suggest } from "@/server/catalog";
import { getActivePromotions } from "@/server/promotions";
import { baseRows, cleanCatalog, csv, importCsv } from "./helpers";

describe("catalogue queries", () => {
  beforeEach(async () => {
    await cleanCatalog();
    await importCsv(csv(baseRows()), { publishNew: true });
  });

  it("finds products by part of the name, case-insensitively, without merging dosages", async () => {
    const res = await listVariants({ locale: "ru", pharmacyId: null, filters: { q: "ТЕСТОФ" } });
    expect(res.items.map((i) => i.fullName).sort()).toEqual(["Тестофен 200 мг №10 табл.", "Тестофен 400 мг №10 табл."]);
    const sug = await suggest("тестоф", "ru");
    expect(sug.items.filter((s) => s.type === "variant")).toHaveLength(2);
  });

  it("is safe with special characters", async () => {
    const res = await listVariants({ locale: "ru", pharmacyId: null, filters: { q: "%' OR 1=1 --" } });
    expect(res.total).toBe(0);
  });

  it("filters by stock in the selected pharmacy and sorts by price", async () => {
    const sal1 = await prisma.pharmacy.findUniqueOrThrow({ where: { code: "SAL-01" } });
    const inStock = await listVariants({ locale: "ru", pharmacyId: sal1.id, filters: { inStock: true, sort: "price_asc" } });
    expect(inStock.items.map((i) => i.fullName)).toEqual(["Тестофен 200 мг №10 табл.", "Рецептин 50 мг №30 табл."]);
    const desc = await listVariants({ locale: "ru", pharmacyId: sal1.id, filters: { sort: "price_desc" } });
    expect(desc.items[0].offer.priceKzt).toBe(2000);
  });

  it("shows active promotions only within their period", async () => {
    const v = await prisma.productVariant.findFirstOrThrow();
    const day = 86400_000;
    await prisma.promotion.create({ data: { slug: "t-active", titleRu: "Активная", type: "BONUS", benefitValue: 100, benefitUnit: "KZT", startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day), status: "PUBLISHED", appliesToAllPharmacies: true, variants: { create: { variantId: v.id } } } });
    await prisma.promotion.create({ data: { slug: "t-ended", titleRu: "Завершённая", type: "DISCOUNT", startsAt: new Date(Date.now() - 10 * day), endsAt: new Date(Date.now() - day), status: "PUBLISHED", appliesToAllPharmacies: true, variants: { create: { variantId: v.id } } } });
    await prisma.promotion.create({ data: { slug: "t-draft", titleRu: "Черновик", type: "OTHER", startsAt: new Date(Date.now() - day), status: "DRAFT", appliesToAllPharmacies: true } });
    const active = await getActivePromotions("ru");
    expect(active.map((p) => p.slug)).toEqual(["t-active"]);
  });
});
