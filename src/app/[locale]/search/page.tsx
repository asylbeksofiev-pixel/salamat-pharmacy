import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { getFacets, listVariants } from "@/server/catalog";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { parseCatalogParams } from "@/lib/params";
import { MAX_QUERY_LENGTH } from "@/lib/search-normalize";
import { CatalogView } from "@/components/catalog/CatalogView";
import { EmptyState, Notice } from "@/components/ui/Feedback";
import { SearchBox } from "@/components/site/SearchBox";

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
  const sp = await searchParams;
  const rawQ = typeof sp.q === "string" ? sp.q.trim() : "";
  const filters = parseCatalogParams(sp);
  const basePath = localizedPath(locale, "/search");
  if (!rawQ) {
    return (
      <div className="container-page py-10">
        <h1 className="mb-6 text-[1.75rem] font-bold">{t.meta.searchTitle}</h1>
        <div className="max-w-2xl">
          <SearchBox size="lg" idPrefix="page" />
        </div>
        <EmptyState className="mt-8" icon="search" title={t.search.emptyQuery} />
      </div>
    );
  }
  if (rawQ.length > MAX_QUERY_LENGTH) {
    return (
      <div className="container-page py-10">
        <h1 className="mb-6 text-[1.75rem] font-bold">{t.meta.searchTitle}</h1>
        <Notice tone="warning">{t.search.tooLong}</Notice>
      </div>
    );
  }
  const pharmacy = await getSelectedPharmacy(locale);
  const result = await listVariants({ locale, pharmacyId: pharmacy?.id ?? null, filters });
  const facets = await getFacets({ pharmacyId: pharmacy?.id ?? null, q: result.usedQuery ?? rawQ });
  return (
    <CatalogView
      locale={locale}
      t={t}
      title={result.total ? fmt(t.search.resultsFor, { q: rawQ }) : fmt(t.search.nothingFound, { q: rawQ })}
      crumbs={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.meta.searchTitle }]}
      basePath={basePath}
      filters={filters}
      result={result}
      facets={facets}
      pharmacy={pharmacy}
      baseUrl={env.appUrl}
      intro={result.layoutFixed && result.usedQuery ? <Notice tone="info" className="mt-4">{fmt(t.search.layoutFixed, { q: result.usedQuery })}</Notice> : null}
    />
  );
}
