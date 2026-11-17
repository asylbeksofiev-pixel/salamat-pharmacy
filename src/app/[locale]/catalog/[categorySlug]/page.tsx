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
import { listCatalogItems, type CatalogPage } from "@/server/catalog-items";
import { getStorefrontState } from "@/server/storefront";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/catalog/[categorySlug]">) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const tree = await getCategoryTree(locale);
  const node = tree.bySlug.get(categorySlug);
  if (!node) return {};
  const f = parseCatalogParams(await searchParams);
  const store = await getStorefrontState();
  const empty = !store.categoryIdsWithProducts.has(node.id);
  return pageMetadata(locale, `/catalog/${node.slug}`, node.name, `${node.name} — ${t.meta.catalogDescription}`, {
    noindex: empty || hasActiveFilters(f) || (f.page ?? 1) > 1 || !!f.sort,
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
  if (!store.categoryIdsWithProducts.has(node.id)) {
    // The product list (public.pharmacy_products) has no categories yet, so this section has no products.
    // Say so plainly and show the full catalogue instead of "0 products" with filters.
    const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
    const page = typeof sp.page === "string" && /^\d{1,6}$/.test(sp.page) ? Math.max(1, Number(sp.page)) : 1;
    let result: CatalogPage | null = null;
    let failed = false;
    try {
      result = await listCatalogItems({ q, page });
    } catch (e) {
      failed = true;
      console.error("catalog items failed", (e as Error).message.slice(0, 200));
    }
    return (
      <CatalogItemsView
        locale={locale}
        t={t}
        title={node.name}
        crumbs={[
          { label: t.common.home, href: localizedPath(locale, "/") },
          { label: t.catalog.title, href: localizedPath(locale, "/catalog") },
          { label: node.name },
        ]}
        basePath={localizedPath(locale, "/catalog")}
        q={q}
        result={result}
        failed={failed}
        baseUrl={env.appUrl}
        before={
          <Notice tone="info" className="mt-4">
            {t.items.categoryUnavailable}
          </Notice>
        }
      />
    );
  }
  const filters = parseCatalogParams(sp);
  filters.q = undefined;
  const pharmacy = await getSelectedPharmacy(locale);
  const ids = descendantIds(node);
  const [result, facets] = await Promise.all([
    listVariants({ locale, pharmacyId: pharmacy?.id ?? null, categoryIds: ids, filters }),
    getFacets({ pharmacyId: pharmacy?.id ?? null, categoryIds: ids }),
  ]);
  const path = categoryPath(node, tree.byId);
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
