"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { bool, guarded, optInt, optStr, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";

export const savePage = guarded("content.write", async (user, slug: string, _prev: unknown, fd: FormData) => {
  const data = z
    .object({
      titleRu: z.string().min(1).max(200),
      titleKk: z.string().max(200).nullable(),
      bodyRu: z.string().min(1, "Текст не может быть пустым").max(50_000),
      bodyKk: z.string().max(50_000).nullable(),
      metaDescriptionRu: z.string().max(300).nullable(),
      metaDescriptionKk: z.string().max(300).nullable(),
      status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
      requiresLegalReview: z.boolean(),
    })
    .parse({
      titleRu: str(fd, "titleRu"),
      titleKk: optStr(fd, "titleKk"),
      bodyRu: str(fd, "bodyRu"),
      bodyKk: optStr(fd, "bodyKk"),
      metaDescriptionRu: optStr(fd, "metaDescriptionRu"),
      metaDescriptionKk: optStr(fd, "metaDescriptionKk"),
      status: str(fd, "status") || "PUBLISHED",
      requiresLegalReview: bool(fd, "requiresLegalReview"),
    });
  const page = await prisma.contentPage.findUnique({ where: { slug } });
  if (!page) return fail("Страница не найдена");
  await prisma.contentPage.update({ where: { slug }, data });
  await audit(user.id, "content.update", "ContentPage", page.id, `Страница «${slug}»${data.requiresLegalReview ? " (черновик для юриста)" : ""}`);
  revalidatePath(`/admin/content/${slug}`);
  return done("Сохранено");
});

export const saveFaq = guarded("content.write", async (user, id: string | null, _prev: unknown, fd: FormData) => {
  const data = z
    .object({ questionRu: z.string().min(1).max(300), questionKk: z.string().max(300).nullable(), answerRu: z.string().min(1).max(3000), answerKk: z.string().max(3000).nullable(), sortOrder: z.number().int(), isPublished: z.boolean() })
    .parse({ questionRu: str(fd, "questionRu"), questionKk: optStr(fd, "questionKk"), answerRu: str(fd, "answerRu"), answerKk: optStr(fd, "answerKk"), sortOrder: optInt(fd, "sortOrder") ?? 100, isPublished: id ? bool(fd, "isPublished") : true });
  if (id) {
    await prisma.fAQItem.update({ where: { id }, data });
    await audit(user.id, "faq.update", "FAQItem", id, data.questionRu);
  } else {
    const f = await prisma.fAQItem.create({ data });
    await audit(user.id, "faq.create", "FAQItem", f.id, data.questionRu);
  }
  revalidatePath("/admin/content");
  return done("Сохранено");
});

export const deleteFaq = guarded("content.write", async (user, id: string, _prev: unknown, _fd: FormData) => {
  void _fd;
  const f = await prisma.fAQItem.delete({ where: { id } });
  await audit(user.id, "faq.delete", "FAQItem", id, f.questionRu);
  revalidatePath("/admin/content");
  return done("Удалено");
});
