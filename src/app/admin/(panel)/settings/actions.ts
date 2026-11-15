"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/audit";
import { bool, guarded, optInt, optStr, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { getSettings, saveSetting } from "@/server/settings";
import { normalizeKzPhone } from "@/lib/phone";

export const saveSettings = guarded("settings.manage", async (user, _prev: unknown, fd: FormData) => {
  const current = await getSettings();
  const phone = normalizeKzPhone(str(fd, "helplinePhone"));
  if (!phone) return fail("Справочный телефон: формат +7 7XX XXX XX XX");
  const bin = str(fd, "bin").replace(/\s/g, "");
  if (!/^\d{12}$/.test(bin)) return fail("БИН должен содержать 12 цифр");
  const priceStale = optInt(fd, "priceStaleHours") ?? 72;
  const stockStale = optInt(fd, "stockStaleHours") ?? 24;
  if (priceStale < 1 || priceStale > 24 * 60 || stockStale < 1 || stockStale > 24 * 60) return fail("Порог устаревания: от 1 часа до 60 дней");
  const offerPolicy = {
    priceStaleHours: priceStale,
    stockStaleHours: stockStale,
    lowStockThreshold: Math.max(0, Math.min(100, optInt(fd, "lowStockThreshold") ?? 3)),
    rxPolicy: z.enum(["BLOCK", "PICKUP_WITH_PRESCRIPTION"]).parse(str(fd, "rxPolicy")),
    unknownRxPolicy: z.enum(["ALLOW_WITH_NOTICE", "BLOCK"]).parse(str(fd, "unknownRxPolicy")),
  };
  const deliveryEnabled = bool(fd, "deliveryEnabled");
  const deliveryTermsRu = str(fd, "deliveryTermsRu");
  if (deliveryEnabled && !deliveryTermsRu) return fail("Перед включением доставки опишите её условия (зоны, стоимость, сроки, оплата)");
  const email = optStr(fd, "email");
  if (email && !z.string().email().safeParse(email).success) return fail("Некорректный e-mail компании");
  await saveSetting("helpline", { phone, verified: bool(fd, "helplineVerified"), hoursRu: optStr(fd, "helplineHoursRu") ?? undefined, hoursKk: optStr(fd, "helplineHoursKk") ?? undefined });
  await saveSetting("company", { legalName: str(fd, "legalName") || current.company.legalName, bin, foundedYear: optInt(fd, "foundedYear") ?? current.company.foundedYear, legalAddress: str(fd, "legalAddress"), email: email ?? undefined, licenseInfo: optStr(fd, "licenseInfo") ?? undefined, verified: bool(fd, "companyVerified") });
  await saveSetting("offerPolicy", offerPolicy);
  await saveSetting("checkout", {
    deliveryEnabled,
    deliveryTermsRu,
    deliveryTermsKk: str(fd, "deliveryTermsKk"),
    maxLines: Math.max(1, Math.min(100, optInt(fd, "maxLines") ?? 30)),
    maxQtyPerLine: Math.max(1, Math.min(99, optInt(fd, "maxQtyPerLine") ?? 10)),
    consentVersion: str(fd, "consentVersion").slice(0, 60) || current.checkout.consentVersion,
  });
  await saveSetting("retention", { orderPiiDays: Math.max(30, Math.min(3650, optInt(fd, "orderPiiDays") ?? 180)) });
  await audit(user.id, "settings.update", "SiteSetting", null, "Изменены настройки сайта", { offerPolicy, deliveryEnabled });
  revalidatePath("/admin/settings");
  return done("Настройки сохранены");
});
