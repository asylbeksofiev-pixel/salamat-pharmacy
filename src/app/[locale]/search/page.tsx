import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { listCatalogItems, type CatalogPage } from "@/server/catalog-items";
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
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = typeof sp.page === "string" && /^\d{1,6}$/.test(sp.page) ? Math.max(1, Number(sp.page)) : 1;
  let result: CatalogPage | null = null;
  let failed = false;
  try {
    result = await listCatalogItems({ q, page });
  } catch (e) {
    failed = true;
    console.error("catalog search failed", (e as Error).message.slice(0, 200));
  }
  return (
    <CatalogItemsView
      locale={locale}
      t={t}
      title={q ? fmt(t.search.resultsFor, { q }) : t.meta.searchTitle}
      crumbs={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.meta.searchTitle }]}
      basePath={localizedPath(locale, "/search")}
      q={q}
      result={result}
      failed={failed}
      baseUrl={env.appUrl}
    />
  );
}
