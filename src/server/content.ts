import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import { pickLocalized, type Locale } from "@/lib/i18n";

export interface PageView {
  slug: string;
  title: string;
  body: string;
  metaDescription: string | null;
  requiresLegalReview: boolean;
  updatedAt: string;
  translated: boolean;
}

export const getPage = cache(async (slug: string, locale: Locale): Promise<PageView | null> => {
  const p = await prisma.contentPage.findUnique({ where: { slug } });
  if (!p || p.status !== "PUBLISHED") return null;
  const translated = locale === "kk" ? !!p.bodyKk : true;
  return {
    slug: p.slug,
    title: pickLocalized(locale, p.titleRu, p.titleKk),
    body: pickLocalized(locale, p.bodyRu, p.bodyKk),
    metaDescription: locale === "kk" ? (p.metaDescriptionKk ?? p.metaDescriptionRu) : p.metaDescriptionRu,
    requiresLegalReview: p.requiresLegalReview,
    updatedAt: p.updatedAt.toISOString(),
    translated,
  };
});

export async function getFaq(locale: Locale) {
  const items = await prisma.fAQItem.findMany({ where: { isPublished: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return items.map((i) => ({
    id: i.id,
    question: pickLocalized(locale, i.questionRu, i.questionKk),
    answer: pickLocalized(locale, i.answerRu, i.answerKk),
  }));
}
