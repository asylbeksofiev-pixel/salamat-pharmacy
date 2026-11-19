import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { loadCatalogListing } from "@/server/catalog-listing";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { CatalogItemsView } from "@/components/catalog/CatalogItems";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  return pageMetadata(locale, "/search", q ? fmt(t.search.resultsFor, { q }) : t.meta.searchTitle, null, { noindex: true });
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const listing = await loadCatalogListing({ locale, searchParams: await searchParams });
  const q = listing.query.q;
  return (
    <CatalogItemsView
      locale={locale}
      t={t}
      title={q ? fmt(t.search.resultsFor, { q }) : t.meta.searchTitle}
      crumbs={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.meta.searchTitle }]}
      basePath={localizedPath(locale, "/search")}
      query={listing.query}
      result={listing.result}
      failed={listing.failed}
      filters={listing.filters}
      baseUrl={env.appUrl}
    />
  );
}
