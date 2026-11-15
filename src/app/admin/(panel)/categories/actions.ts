"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { bool, guarded, optInt, optStr, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { slugify } from "@/lib/slug";

const schema = z.object({
  nameRu: z.string().min(1, "Укажите название").max(120),
  nameKk: z.string().max(120).nullable(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Только латиница, цифры и дефисы").max(80),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  iconKey: z.string().max(30).nullable(),
  isActive: z.boolean(),
});

export const saveCategory = guarded("catalog.write", async (user, id: string | null, _prev: unknown, fd: FormData) => {
  const nameRu = str(fd, "nameRu");
  const data = schema.parse({
    nameRu,
    nameKk: optStr(fd, "nameKk"),
    slug: str(fd, "slug") || slugify(nameRu),
    parentId: optStr(fd, "parentId"),
    sortOrder: optInt(fd, "sortOrder") ?? 0,
    iconKey: optStr(fd, "iconKey"),
    isActive: id ? bool(fd, "isActive") : true,
  });
  if (id && data.parentId === id) return fail("Категория не может быть родителем самой себя");
  if (id && data.parentId) {
    // Prevent cycles: the new parent must not be a descendant.
    let cur: string | null = data.parentId;
    for (let i = 0; cur && i < 10; i++) {
      if (cur === id) return fail("Нельзя переместить категорию внутрь её подкатегории");
      cur = (await prisma.category.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
  }
  const clash = await prisma.category.findFirst({ where: { slug: data.slug, NOT: id ? { id } : undefined } });
  if (clash) return fail("Такой slug уже используется");
  if (id) {
    await prisma.category.update({ where: { id }, data });
    await audit(user.id, "category.update", "Category", id, `Категория «${data.nameRu}»`);
  } else {
    const c = await prisma.category.create({ data });
    await audit(user.id, "category.create", "Category", c.id, `Создана категория «${data.nameRu}»`);
  }
  revalidatePath("/admin/categories");
  return done("Сохранено");
});

export const deleteCategory = guarded("catalog.write", async (user, id: string, _prev: unknown, _fd: FormData) => {
  void _fd;
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
  if (!c) return fail("Не найдена");
  if (c._count.products || c._count.children) return fail("Сначала перенесите товары и подкатегории");
  await prisma.category.delete({ where: { id } });
  await audit(user.id, "category.delete", "Category", id, `Удалена категория «${c.nameRu}»`);
  revalidatePath("/admin/categories");
  return done("Удалена");
});
