import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { getCategoryTree } from "@/server/catalog";
import { loadCatalogListing } from "@/server/catalog-listing";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { getStorefrontState } from "@/server/storefront";
import { activeFilterCount, parseCatalogQuery } from "@/lib/catalog-params";
import { CatalogItemsView } from "@/components/catalog/CatalogItems";
import { CategoryTile } from "@/components/catalog/Tiles";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const query = parseCatalogQuery(await searchParams);
  return pageMetadata(locale, "/catalog", t.meta.catalogTitle, t.meta.catalogDescription, { noindex: !!query.q || query.page > 1 || activeFilterCount(query) > 0 || !!query.sort });
}

export default async function CatalogPage({ params, searchParams }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [listing, tree, store] = await Promise.all([loadCatalogListing({ locale, searchParams: await searchParams }), getCategoryTree(locale), getStorefrontState()]);
  const roots = tree.roots.filter((c) => store.categoryIdsWithProducts.has(c.id));
  const unfiltered = !listing.query.q && activeFilterCount(listing.query) === 0;
  return (
    <CatalogItemsView
      locale={locale}
      t={t}
      title={t.catalog.title}
      crumbs={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.catalog.title }]}
      basePath={localizedPath(locale, "/catalog")}
      query={listing.query}
      result={listing.result}
      failed={listing.failed}
      filters={listing.filters}
      baseUrl={env.appUrl}
      after={
        roots.length && unfiltered ? (
          <section aria-labelledby="catalog-sections" className="mt-12">
            <h2 id="catalog-sections" className="mb-4 text-xl font-bold">
              {t.items.categoriesTitle}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roots.map((c) => (
                <li key={c.slug}>
                  <CategoryTile slug={c.slug} name={c.name} iconKey={c.iconKey} locale={locale} count={store.catalogCategoryCounts.get(c.id)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
    />
  );
}
