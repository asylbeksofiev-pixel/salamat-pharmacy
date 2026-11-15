import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { categoryPath, descendantIds, getCategoryTree, getFacets, listVariants } from "@/server/catalog";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { parseCatalogParams, hasActiveFilters } from "@/lib/params";
import { CatalogView } from "@/components/catalog/CatalogView";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/catalog/[categorySlug]">) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const tree = await getCategoryTree(locale);
  const node = tree.bySlug.get(categorySlug);
  if (!node) return {};
  const f = parseCatalogParams(await searchParams);
  return pageMetadata(locale, `/catalog/${node.slug}`, node.name, `${node.name} — ${t.meta.catalogDescription}`, { noindex: hasActiveFilters(f) || (f.page ?? 1) > 1 || !!f.sort });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/catalog/[categorySlug]">) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const tree = await getCategoryTree(locale);
  const node = tree.bySlug.get(categorySlug);
  if (!node) notFound();
  const filters = parseCatalogParams(await searchParams);
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
