import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { getPage } from "@/server/content";
import { pageMetadata } from "@/server/seo";
import { ContentPageView } from "@/components/site/ContentPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = await getPage("terms", locale);
  if (!page) return {};
  return pageMetadata(locale, "/terms", page.title, page.metaDescription, { noindex: page.requiresLegalReview });
}

export default async function Page({ params }: PageProps<"/[locale]/terms">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const page = await getPage("terms", locale);
  if (!page) notFound();
  return <ContentPageView page={page} t={getDictionary(locale)} locale={locale} />;
}
