"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { bool, guarded, optInt, optStr, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { slugify } from "@/lib/slug";

/** "2026-12-01T10:00" from <input type=datetime-local>, interpreted as Astana time (UTC+5). */
function parseLocal(v: string): Date | null {
  if (!v) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Только латиница, цифры и дефисы").max(80),
  titleRu: z.string().min(1, "Укажите название").max(200),
  titleKk: z.string().max(200).nullable(),
  descriptionRu: z.string().max(3000).nullable(),
  descriptionKk: z.string().max(3000).nullable(),
  termsRu: z.string().max(3000).nullable(),
  termsKk: z.string().max(3000).nullable(),
  imageUrl: z.string().url().startsWith("https://", "Только https").max(1000).nullable(),
  type: z.enum(["DISCOUNT", "BONUS", "OTHER"]),
  benefitValue: z.number().int().positive().max(10_000_000).nullable(),
  benefitUnit: z.enum(["KZT", "PERCENT"]).nullable(),
  startsAt: z.date({ error: "Укажите дату начала" }),
  endsAt: z.date().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  appliesToAllPharmacies: z.boolean(),
});

export const savePromotion = guarded("promotions.write", async (user, id: string | null, _prev: unknown, fd: FormData) => {
  const titleRu = str(fd, "titleRu");
  const data = schema.parse({
    slug: str(fd, "slug") || slugify(titleRu),
    titleRu,
    titleKk: optStr(fd, "titleKk"),
    descriptionRu: optStr(fd, "descriptionRu"),
    descriptionKk: optStr(fd, "descriptionKk"),
    termsRu: optStr(fd, "termsRu"),
    termsKk: optStr(fd, "termsKk"),
    imageUrl: optStr(fd, "imageUrl"),
    type: str(fd, "type"),
    benefitValue: optInt(fd, "benefitValue"),
    benefitUnit: optStr(fd, "benefitUnit"),
    startsAt: parseLocal(str(fd, "startsAt")),
    endsAt: parseLocal(str(fd, "endsAt")),
    status: str(fd, "status") || "DRAFT",
    appliesToAllPharmacies: bool(fd, "appliesToAllPharmacies"),
  });
  if (data.endsAt && data.endsAt <= data.startsAt) return fail("Дата окончания должна быть позже даты начала");
  if (data.benefitValue && !data.benefitUnit) return fail("Укажите единицу выгоды: ₸ или %");
  if (data.benefitUnit === "PERCENT" && data.benefitValue && data.benefitValue > 100) return fail("Процент не может быть больше 100");
  const pharmacyIds = fd.getAll("pharmacyIds").map(String);
  const categoryIds = fd.getAll("categoryIds").map(String);
  if (!data.appliesToAllPharmacies && !pharmacyIds.length && data.status === "PUBLISHED") return fail("Выберите аптеки или отметьте «Все аптеки»");
  // SKUs by article, barcode or slug, one per line.
  const refs = str(fd, "skus").split(/[\n,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 500);
  const variants = refs.length ? await prisma.productVariant.findMany({ where: { OR: [{ salamatSku: { in: refs } }, { barcode: { in: refs } }, { slug: { in: refs } }] }, select: { id: true, salamatSku: true, barcode: true, slug: true } }) : [];
  const found = new Set(variants.flatMap((v) => [v.salamatSku, v.barcode, v.slug]));
  const missing = refs.filter((r) => !found.has(r));
  if (missing.length) return fail(`Не найдены SKU: ${missing.slice(0, 10).join(", ")}`);
  if (data.status === "PUBLISHED" && !variants.length && !categoryIds.length) return fail("Укажите товары (SKU) или категории, участвующие в акции");
  const clash = await prisma.promotion.findFirst({ where: { slug: data.slug, NOT: id ? { id } : undefined } });
  if (clash) return fail("Такой slug уже используется");
  const relations = {
    variants: { create: variants.map((v) => ({ variantId: v.id })) },
    categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
    pharmacies: { create: data.appliesToAllPharmacies ? [] : pharmacyIds.map((pharmacyId) => ({ pharmacyId })) },
  };
  let promoId = id;
  if (id) {
    await prisma.$transaction([
      prisma.promotionVariant.deleteMany({ where: { promotionId: id } }),
      prisma.promotionCategory.deleteMany({ where: { promotionId: id } }),
      prisma.promotionPharmacy.deleteMany({ where: { promotionId: id } }),
      prisma.promotion.update({ where: { id }, data: { ...data, ...relations } }),
    ]);
    await audit(user.id, "promotion.update", "Promotion", id, `Акция «${data.titleRu}» (${data.status})`);
  } else {
    const p = await prisma.promotion.create({ data: { ...data, ...relations } });
    promoId = p.id;
    await audit(user.id, "promotion.create", "Promotion", p.id, `Создана акция «${data.titleRu}»`);
  }
  revalidatePath("/admin/promotions");
  if (!id) redirect(`/admin/promotions/${promoId}`);
  return done("Сохранено");
});
