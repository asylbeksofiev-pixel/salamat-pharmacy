import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { getCategoryTree, getFacets, listVariants } from "@/server/catalog";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { parseCatalogParams, hasActiveFilters } from "@/lib/params";
import { CatalogView } from "@/components/catalog/CatalogView";
import { CategoryTile } from "@/components/catalog/Tiles";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const f = parseCatalogParams(await searchParams);
  return pageMetadata(locale, "/catalog", t.meta.catalogTitle, t.meta.catalogDescription, { noindex: hasActiveFilters(f) || (f.page ?? 1) > 1 || !!f.sort });
}

export default async function CatalogPage({ params, searchParams }: PageProps<"/[locale]/catalog">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const filters = parseCatalogParams(await searchParams);
  filters.q = undefined;
  const [tree, pharmacy] = await Promise.all([getCategoryTree(locale), getSelectedPharmacy(locale)]);
  const [result, facets] = await Promise.all([
    listVariants({ locale, pharmacyId: pharmacy?.id ?? null, filters }),
    getFacets({ pharmacyId: pharmacy?.id ?? null }),
  ]);
  return (
    <CatalogView
      locale={locale}
      t={t}
      title={t.catalog.title}
      crumbs={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.catalog.title }]}
      basePath={localizedPath(locale, "/catalog")}
      filters={filters}
      result={result}
      facets={facets}
      pharmacy={pharmacy}
      baseUrl={env.appUrl}
      intro={
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tree.roots.map((c) => (
            <li key={c.slug}>
              <CategoryTile slug={c.slug} name={c.name} iconKey={c.iconKey} locale={locale} />
            </li>
          ))}
        </ul>
      }
    />
  );
}
