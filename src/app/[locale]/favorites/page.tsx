import { notFound } from "next/navigation";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/server/seo";
import { FavoritesView } from "@/components/catalog/FavoritesView";

export async function generateMetadata({ params }: PageProps<"/[locale]/favorites">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, "/favorites", getDictionary(locale).meta.favoritesTitle, null, { noindex: true });
}

export default async function FavoritesPage({ params }: PageProps<"/[locale]/favorites">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <FavoritesView />;
}
