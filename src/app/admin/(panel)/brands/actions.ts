"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { refreshProductSearchText } from "@/server/import/pipeline";
import { slugify } from "@/lib/slug";

export const saveBrand = guarded("catalog.write", async (user, id: string | null, _prev: unknown, fd: FormData) => {
  const name = str(fd, "name").slice(0, 120);
  if (!name) return fail("Укажите название");
  const slug = (str(fd, "slug") || slugify(name)).slice(0, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fail("Slug: только латиница, цифры и дефисы");
  const clash = await prisma.brand.findFirst({ where: { slug, NOT: id ? { id } : undefined } });
  if (clash) return fail("Такой slug уже используется");
  if (id) {
    await prisma.brand.update({ where: { id }, data: { name, slug } });
    const products = await prisma.product.findMany({ where: { brandId: id }, select: { id: true } });
    for (const p of products) await refreshProductSearchText(prisma, p.id);
    await audit(user.id, "brand.update", "Brand", id, `Бренд «${name}»`);
  } else {
    const b = await prisma.brand.create({ data: { name, slug } });
    await audit(user.id, "brand.create", "Brand", b.id, `Создан бренд «${name}»`);
  }
  revalidatePath("/admin/brands");
  return done("Сохранено");
});
