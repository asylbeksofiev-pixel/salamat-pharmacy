"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit, diffFields } from "@/server/audit";
import { bool, guarded, optInt, optStr, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { refreshProductSearchText, refreshSearchText } from "@/server/import/pipeline";
import { slugify } from "@/lib/slug";

const productSchema = z.object({
  name: z.string().min(1, "Укажите название").max(300),
  nameKk: z.string().max(300).nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Только латиница, цифры и дефисы").max(120),
  brandId: z.string().nullable(),
  categoryId: z.string().nullable(),
  manufacturer: z.string().max(200).nullable(),
  descriptionRu: z.string().max(5000).nullable(),
  descriptionKk: z.string().max(5000).nullable(),
  searchAliases: z.array(z.string().max(100)).max(30),
});

function readProduct(fd: FormData) {
  const name = str(fd, "name");
  return productSchema.parse({
    name,
    nameKk: optStr(fd, "nameKk"),
    slug: str(fd, "slug") || slugify(name),
    brandId: optStr(fd, "brandId"),
    categoryId: optStr(fd, "categoryId"),
    manufacturer: optStr(fd, "manufacturer"),
    descriptionRu: optStr(fd, "descriptionRu"),
    descriptionKk: optStr(fd, "descriptionKk"),
    searchAliases: str(fd, "searchAliases").split(/[;\n]/).map((s) => s.trim()).filter(Boolean),
  });
}

export const createProduct = guarded("catalog.write", async (user, _prev: unknown, fd: FormData) => {
  const data = readProduct(fd);
  if (await prisma.product.findUnique({ where: { slug: data.slug } })) return fail("Такой адрес (slug) уже занят", { slug: "занят" });
  const p = await prisma.product.create({ data: { ...data, publicationStatus: "DRAFT" } });
  await audit(user.id, "product.create", "Product", p.id, `Создан товар «${p.name}» (черновик)`);
  redirect(`/admin/products/${p.id}`);
});

export const updateProduct = guarded("catalog.write", async (user, id: string, _prev: unknown, fd: FormData) => {
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return fail("Товар не найден");
  const data = readProduct(fd);
  if (data.slug !== before.slug && (await prisma.product.findUnique({ where: { slug: data.slug } }))) return fail("Такой адрес (slug) уже занят");
  await prisma.product.update({ where: { id }, data });
  await refreshProductSearchText(prisma, id);
  await audit(user.id, "product.update", "Product", id, `Изменён товар «${data.name}»`, diffFields(before as unknown as Record<string, unknown>, data) as object);
  revalidatePath(`/admin/products/${id}`);
  return done("Сохранено");
});

export const setProductStatus = guarded("catalog.write", async (user, id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", _prev: unknown, _fd: FormData) => {
  void _fd;
  const p = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { variants: true } } } });
  if (!p) return fail("Товар не найден");
  if (status === "PUBLISHED" && p._count.variants === 0) return fail("Нельзя опубликовать товар без вариантов (SKU)");
  await prisma.product.update({ where: { id }, data: { publicationStatus: status } });
  await audit(user.id, "product.status", "Product", id, `«${p.name}»: ${p.publicationStatus} → ${status}`);
  revalidatePath(`/admin/products/${id}`);
  return done(status === "PUBLISHED" ? "Опубликован" : status === "DRAFT" ? "Снят с публикации" : "В архиве");
});

export const toggleFeatured = guarded("catalog.write", async (user, id: string, _prev: unknown, _fd: FormData) => {
  void _fd;
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return fail("Товар не найден");
  await prisma.product.update({ where: { id }, data: { featuredAt: p.featuredAt ? null : new Date() } });
  await audit(user.id, "product.featured", "Product", id, `«${p.name}»: ${p.featuredAt ? "убран из подборки" : "добавлен в подборку фармацевтов"}`);
  revalidatePath(`/admin/products/${id}`);
  return done(p.featuredAt ? "Убран из подборки" : "Добавлен в подборку на главной");
});

const variantSchema = z.object({
  fullName: z.string().min(1, "Укажите полное наименование SKU").max(300),
  dosage: z.string().max(120).nullable(),
  form: z.string().max(120).nullable(),
  volume: z.string().max(120).nullable(),
  packageSize: z.string().max(120).nullable(),
  packageQuantity: z.number().int().min(0).max(100000).nullable(),
  prescriptionStatus: z.enum(["PRESCRIPTION", "NON_PRESCRIPTION", "UNKNOWN"]),
  barcode: z.string().regex(/^\d{8,14}$/, "Штрихкод: 8–14 цифр").nullable(),
  salamatSku: z.string().max(60).nullable(),
  externalId: z.string().max(100).nullable(),
  imageUrl: z.string().url().startsWith("https://", "Только https-ссылки").max(1000).nullable(),
  isActive: z.boolean(),
});

export const saveVariant = guarded("catalog.write", async (user, productId: string, variantId: string | null, _prev: unknown, fd: FormData) => {
  const data = variantSchema.parse({
    fullName: str(fd, "fullName"),
    dosage: optStr(fd, "dosage"),
    form: optStr(fd, "form")?.toLowerCase() ?? null,
    volume: optStr(fd, "volume"),
    packageSize: optStr(fd, "packageSize"),
    packageQuantity: optInt(fd, "packageQuantity"),
    prescriptionStatus: str(fd, "prescriptionStatus") || "UNKNOWN",
    barcode: optStr(fd, "barcode"),
    salamatSku: optStr(fd, "salamatSku"),
    externalId: optStr(fd, "externalId"),
    imageUrl: optStr(fd, "imageUrl"),
    isActive: variantId ? bool(fd, "isActive") : true,
  });
  if (data.salamatSku) {
    const clash = await prisma.productVariant.findFirst({ where: { salamatSku: data.salamatSku, NOT: variantId ? { id: variantId } : undefined } });
    if (clash) return fail(`Артикул ${data.salamatSku} уже используется: «${clash.fullName}»`);
  }
  const manual = await prisma.dataSource.findUnique({ where: { code: "manual" } });
  if (variantId) {
    const before = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!before || before.productId !== productId) return fail("Вариант не найден");
    await prisma.productVariant.update({ where: { id: variantId }, data: { ...data, lastVerifiedAt: new Date() } });
    await refreshSearchText(prisma, variantId);
    await audit(user.id, "variant.update", "ProductVariant", variantId, `Изменён SKU «${data.fullName}»`, diffFields(before as unknown as Record<string, unknown>, data) as object);
  } else {
    let slug = slugify(data.fullName);
    if (await prisma.productVariant.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
    const v = await prisma.productVariant.create({ data: { ...data, productId, slug, sourceId: manual?.id ?? null, lastVerifiedAt: new Date() } });
    await refreshSearchText(prisma, v.id);
    await audit(user.id, "variant.create", "ProductVariant", v.id, `Добавлен SKU «${data.fullName}»`);
  }
  revalidatePath(`/admin/products/${productId}`);
  return done("Вариант сохранён");
});
