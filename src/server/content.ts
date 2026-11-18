import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import { getDictionary, hasOwnTranslation, pickLocalized, pickLocalizedOptional, type Locale } from "@/lib/i18n";

export interface PageView {
  slug: string;
  title: string;
  body: string;
  metaDescription: string | null;
  requiresLegalReview: boolean;
  updatedAt: string;
  translated: boolean;
}

/** Interface titles for the standard pages: used as the heading when the page text itself is untranslated. */
function uiTitle(slug: string, locale: Locale): string | null {
  const t = getDictionary(locale);
  const titles: Record<string, string> = { about: t.common.about, help: t.meta.helpTitle, contacts: t.meta.contactsTitle, privacy: t.common.privacy, terms: t.common.terms };
  return titles[slug] ?? null;
}

export const getPage = cache(async (slug: string, locale: Locale): Promise<PageView | null> => {
  const p = await prisma.contentPage.findUnique({ where: { slug } });
  if (!p || p.status !== "PUBLISHED") return null;
  // English (and Kazakh without a translation) shows the Russian original with a notice. The heading and
  // the SEO title of English pages come from the interface, so the page is still clearly labelled in English.
  const translated = hasOwnTranslation(locale, p.bodyKk);
  return {
    slug: p.slug,
    title: locale === "en" ? (uiTitle(p.slug, locale) ?? p.titleRu) : pickLocalized(locale, p.titleRu, p.titleKk),
    body: pickLocalized(locale, p.bodyRu, p.bodyKk),
    metaDescription: locale === "en" ? null : pickLocalizedOptional(locale, p.metaDescriptionRu, p.metaDescriptionKk),
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
