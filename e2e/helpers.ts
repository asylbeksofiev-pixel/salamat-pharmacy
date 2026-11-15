import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient({ datasources: { db: { url: process.env.E2E_DATABASE_URL || "postgresql://salamat@127.0.0.1:5433/salamat_e2e_test" } } });

export async function selectPharmacy(page: Page, addressPart: RegExp) {
  await page.getByRole("button", { name: /Выбрать аптеку|Ваша аптека/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: addressPart }).click();
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Сменить" });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator("header").getByText(addressPart).first()).toBeVisible();
}

export async function loginAdmin(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Пароль").fill(process.env.DEMO_STAFF_PASSWORD || "salamat-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/admin$/);
}

export async function resetLimits() {
  await db.rateLimitBucket.deleteMany({});
}

export const PRODUCT = "/product/paratsetamol-demo-farma";
