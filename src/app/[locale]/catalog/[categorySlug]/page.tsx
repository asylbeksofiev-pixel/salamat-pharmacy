import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { categoryPath, descendantIds, getCategoryTree, getFacets, listVariants } from "@/server/catalog";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { parseCatalogParams, hasActiveFilters } from "@/lib/params";
import { CatalogView } from "@/components/catalog/CatalogView";
import { CatalogItemsView } from "@/components/catalog/CatalogItems";
import { Notice } from "@/components/ui/Feedback";
import { loadCatalogListing } from "@/server/catalog-listing";
import { getStorefrontState } from "@/server/storefront";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/catalog/[categorySlug]">) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const tree = await getCategoryTree(locale);
  const node = tree.bySlug.get(categorySlug);
  if (!node) return {};
  const sp = await searchParams;
  const f = parseCatalogParams(sp);
  const store = await getStorefrontState();
  const empty = !store.categoryIdsWithProducts.has(node.id);
  const extra = ["category", "priceMin", "priceMax", "hasPrice", "hasPhoto", "sort", "q"].some((k) => k in sp);
  return pageMetadata(locale, `/catalog/${node.slug}`, node.name, `${node.name} — ${t.meta.catalogDescription}`, {
    noindex: empty || extra || hasActiveFilters(f) || (f.page ?? 1) > 1 || !!f.sort,
  });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/catalog/[categorySlug]">) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const tree = await getCategoryTree(locale);
  const node = tree.bySlug.get(categorySlug);
  if (!node) notFound();
  const sp = await searchParams;
  const store = await getStorefrontState();
  const path = categoryPath(node, tree.byId);
  const crumbs = [
    { label: t.common.home, href: localizedPath(locale, "/") },
    { label: t.catalog.title, href: localizedPath(locale, "/catalog") },
    ...path.map((c, i) => (i === path.length - 1 ? { label: c.name } : { label: c.name, href: localizedPath(locale, `/catalog/${c.slug}`) })),
  ];
  // Catalogue products (public.pharmacy_products) with a published section: the real assortment.
  if (store.catalogCategoryCounts.has(node.id)) {
    const listing = await loadCatalogListing({ locale, searchParams: sp, section: node });
    return (
      <CatalogItemsView
        locale={locale}
        t={t}
        title={node.name}
        crumbs={crumbs}
        basePath={localizedPath(locale, `/catalog/${node.slug}`)}
        query={listing.query}
        result={listing.result}
        failed={listing.failed}
        filters={listing.filters}
        baseUrl={env.appUrl}
      />
    );
  }
  if (!store.categoryIdsWithProducts.has(node.id)) {
    // No products in this section yet: say so plainly and show the full catalogue instead of "0 products".
    const listing = await loadCatalogListing({ locale, searchParams: sp });
    return (
      <CatalogItemsView
        locale={locale}
        t={t}
        title={node.name}
        crumbs={crumbs}
        basePath={localizedPath(locale, "/catalog")}
        query={listing.query}
        result={listing.result}
        failed={listing.failed}
        filters={listing.filters}
        baseUrl={env.appUrl}
        before={
          <Notice tone="info" className="mt-4">
            {t.items.categoryUnavailable}
          </Notice>
        }
      />
    );
  }
  // SKU-level products (demo/structured data) keep their own listing with brand and form filters.
  const filters = parseCatalogParams(sp);
  filters.q = undefined;
  const pharmacy = await getSelectedPharmacy(locale);
  const ids = descendantIds(node);
  const [result, facets] = await Promise.all([
    listVariants({ locale, pharmacyId: pharmacy?.id ?? null, categoryIds: ids, filters }),
    getFacets({ pharmacyId: pharmacy?.id ?? null, categoryIds: ids }),
  ]);
  return (
    <CatalogView
      locale={locale}
      t={t}
      title={node.name}
      crumbs={[
        { label: t.common.home, href: localizedPath(locale, "/") },
        { label: t.catalog.title, href: localizedPath(locale, "/catalog") },
        ...path.map((c) => ({ label: c.name, href: localizedPath(locale, `/catalog/${c.slug}`) })),
      ]}
      basePath={localizedPath(locale, `/catalog/${node.slug}`)}
      category={node}
      subcategories={node.children}
      filters={filters}
      result={result}
      facets={facets}
      pharmacy={pharmacy}
      baseUrl={env.appUrl}
    />
  );
}
