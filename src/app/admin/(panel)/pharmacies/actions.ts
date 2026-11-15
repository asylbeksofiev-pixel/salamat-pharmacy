"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit, diffFields } from "@/server/audit";
import { bool, guarded, optStr, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { canAccessPharmacy } from "@/server/auth/permissions";
import { AccessDeniedError } from "@/server/auth/session";
import { normalizeKzPhone } from "@/lib/phone";
import { WEEKDAYS, parseOpeningHours, type OpeningHours } from "@/lib/hours";
import { slugify } from "@/lib/slug";

function readHours(fd: FormData): OpeningHours | null | "invalid" {
  if (!bool(fd, "hoursConfirmed")) return null;
  const out: Record<string, string[]> = {};
  for (const d of WEEKDAYS) {
    const raw = str(fd, `hours_${d}`);
    out[d] = raw ? raw.split(/[,;]\s*/).map((s) => s.replace(/\s/g, "").replace("–", "-")) : [];
  }
  return parseOpeningHours(out) ?? "invalid";
}

function readCoord(fd: FormData, key: string, min: number, max: number): number | null | "invalid" {
  const v = str(fd, key).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : "invalid";
}

export const savePharmacy = guarded("pharmacies.write", async (user, id: string, _prev: unknown, fd: FormData) => {
  if (!canAccessPharmacy(user, "pharmacies.write", id)) throw new AccessDeniedError("Нет доступа к этому филиалу");
  const before = await prisma.pharmacy.findUnique({ where: { id } });
  if (!before) return fail("Филиал не найден");
  const phonesRaw = str(fd, "phones").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const phones = phonesRaw.map(normalizeKzPhone);
  if (phones.some((p) => !p)) return fail("Проверьте телефоны: нужен формат +7 7XX XXX XX XX");
  const hours = readHours(fd);
  if (hours === "invalid") return fail("Часы работы: формат ЧЧ:ММ-ЧЧ:ММ, несколько интервалов через запятую; пустое поле — выходной");
  const lat = readCoord(fd, "latitude", 40, 56);
  const lng = readCoord(fd, "longitude", 46, 88);
  if (lat === "invalid" || lng === "invalid" || (lat === null) !== (lng === null)) return fail("Координаты: укажите обе в градусах (широта 40–56, долгота 46–88)");
  const data = z
    .object({ addressRu: z.string().min(3).max(200), addressKk: z.string().max(200).nullable(), name: z.string().max(120).nullable(), hoursNote: z.string().max(300).nullable(), internalNote: z.string().max(500).nullable() })
    .parse({ addressRu: str(fd, "addressRu"), addressKk: optStr(fd, "addressKk"), name: optStr(fd, "name"), hoursNote: optStr(fd, "hoursNote"), internalNote: optStr(fd, "internalNote") });
  const update = {
    ...data,
    phones: phones as string[],
    latitude: lat,
    longitude: lng,
    isActive: bool(fd, "isActive"),
    acceptsOrders: bool(fd, "acceptsOrders"),
    ...(bool(fd, "verifyNow") ? { verifiedAt: new Date() } : {}),
  };
  await prisma.pharmacy.update({ where: { id }, data: { ...update, openingHours: hours === null ? Prisma.DbNull : (hours as Prisma.InputJsonValue) } });
  await audit(user.id, "pharmacy.update", "Pharmacy", id, `Филиал ${before.code}: ${data.addressRu}${bool(fd, "verifyNow") ? " (сведения подтверждены)" : ""}`, diffFields(before as unknown as Record<string, unknown>, { ...update, openingHours: hours } as Record<string, unknown>) as object);
  revalidatePath(`/admin/pharmacies/${id}`);
  return done("Сохранено");
});

export const createPharmacy = guarded("settings.manage", async (user, _prev: unknown, fd: FormData) => {
  const code = str(fd, "code").toUpperCase();
  const addressRu = str(fd, "addressRu");
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) return fail("Код: латиница, цифры, дефис (например SAL-15)");
  if (addressRu.length < 3) return fail("Укажите адрес");
  if (await prisma.pharmacy.findUnique({ where: { code } })) return fail("Такой код уже есть");
  const city = await prisma.city.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  if (!city) return fail("Нет активного города");
  let slug = slugify(addressRu.replace(/(ул|пр|д|н\.п)\.?/gi, ""));
  if (await prisma.pharmacy.findUnique({ where: { slug } })) slug = `${slug}-${code.toLowerCase()}`;
  const manual = await prisma.dataSource.findUnique({ where: { code: "manual" } });
  const max = await prisma.pharmacy.aggregate({ _max: { sortOrder: true } });
  const p = await prisma.pharmacy.create({ data: { code, slug, addressRu, cityId: city.id, sourceId: manual?.id, sortOrder: (max._max.sortOrder ?? 0) + 1, isActive: false } });
  await audit(user.id, "pharmacy.create", "Pharmacy", p.id, `Создан филиал ${code} (неактивен до заполнения)`);
  redirect(`/admin/pharmacies/${p.id}`);
});
