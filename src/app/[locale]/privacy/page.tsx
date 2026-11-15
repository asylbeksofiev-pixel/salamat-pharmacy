import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getPage } from "@/server/content";
import { pageMetadata } from "@/server/seo";
import { ContentPageView } from "@/components/site/ContentPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = await getPage("privacy", locale);
  if (!page) return {};
  return pageMetadata(locale, "/privacy", page.title, page.metaDescription, { noindex: page.requiresLegalReview });
}

export default async function Page({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const page = await getPage("privacy", locale);
  if (!page) notFound();
  return <ContentPageView page={page} t={getDictionary(locale)} locale={locale} />;
}
