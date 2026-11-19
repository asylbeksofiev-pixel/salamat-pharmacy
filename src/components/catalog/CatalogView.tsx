import Link from "next/link";
import type { CatalogFilters, CategoryNode, Facets, ListResult, SortKey } from "@/server/catalog";
import type { PharmacyView } from "@/server/pharmacies";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/i18n/config";
import { catalogQuery, hasActiveFilters } from "@/lib/params";
import { Breadcrumbs, type Crumb } from "../ui/Breadcrumbs";
import { Pagination } from "../ui/Pagination";
import { EmptyState, Notice } from "../ui/Feedback";
import { ButtonLink } from "../ui/Button";
import { ProductGrid } from "./ProductCard";
import { CatalogFiltersPanel, SortSelect } from "./Filters";

export function CatalogView({
  locale,
  t,
  title,
  crumbs,
  basePath,
  category,
  subcategories,
  filters,
  result,
  facets,
  pharmacy,
  baseUrl,
  intro,
}: {
  locale: Locale;
  t: Dictionary;
  title: string;
  crumbs: Crumb[];
  basePath: string;
  category?: CategoryNode | null;
  subcategories?: CategoryNode[];
  filters: CatalogFilters;
  result: ListResult;
  facets: Facets;
  pharmacy: PharmacyView | null;
  baseUrl: string;
  intro?: React.ReactNode;
}) {
  const active = hasActiveFilters(filters);
  const activeCount = (filters.brands?.length ?? 0) + (filters.forms?.length ?? 0) + (filters.inStock ? 1 : 0) + (filters.rx ? 1 : 0) + (filters.priceMin !== undefined || filters.priceMax !== undefined ? 1 : 0);
  const sortOptions: { value: SortKey; label: string; disabled?: boolean }[] = [
    ...(filters.q ? [{ value: "relevance" as SortKey, label: t.catalog.sortRelevance }] : []),
    { value: "name", label: t.catalog.sortName },
    { value: "name_desc", label: t.catalog.sortNameDesc },
    { value: "price_asc", label: t.catalog.sortPriceAsc },
    { value: "price_desc", label: t.catalog.sortPriceDesc },
    { value: "updated", label: t.catalog.sortUpdated },
  ];
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs items={crumbs} label={t.common.breadcrumbs} baseUrl={baseUrl} />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
        </div>
      </div>
      {intro}
      {subcategories && subcategories.length ? (
        <nav aria-label={t.catalog.subcategories} className="mt-5">
          <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {subcategories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link href={localizedPath(locale, `/catalog/${c.slug}`)} className="inline-flex h-10 items-center rounded-full border border-line bg-white px-4 text-sm font-medium hover:border-brand-600 hover:text-brand-700">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
        <CatalogFiltersPanel mode="sidebar" basePath={basePath} facets={facets} filters={filters} hasPharmacy={!!pharmacy} activeCount={activeCount} />
        <div className="min-w-0">
          <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 lg:justify-end">
            <div className="lg:hidden">
              <CatalogFiltersPanel mode="mobile" basePath={basePath} facets={facets} filters={filters} hasPharmacy={!!pharmacy} activeCount={activeCount} />
            </div>
            <SortSelect basePath={basePath} filters={filters} options={sortOptions} />
          </div>
          {!pharmacy ? (
            <Notice tone="info" className="mb-4">
              {t.product.selectPharmacyForPrice}
            </Notice>
          ) : null}
          {result.items.length ? (
            <>
              <ProductGrid items={result.items} t={t} locale={locale} pharmacyPhone={pharmacy?.phones[0]} />
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                hrefFor={(p) => `${basePath}${catalogQuery(filters, { page: p })}`}
                labels={{ nav: t.common.pagination, previous: t.common.previous, next: t.common.next, page: t.common.page }}
              />
            </>
          ) : (
            <EmptyState
              icon="search"
              title={t.catalog.emptyTitle}
              text={active ? t.catalog.emptyFiltered : filters.q ? t.search.nothingFoundHint : t.items.categoryPending}
              action={
                active ? (
                  <ButtonLink href={`${basePath}${filters.q ? `?q=${encodeURIComponent(filters.q)}` : ""}`} variant="outline">
                    {t.catalog.resetFilters}
                  </ButtonLink>
                ) : (
                  <ButtonLink href={localizedPath(locale, "/catalog")}>
                    {t.items.allProducts}
                  </ButtonLink>
                )
              }
            />
          )}
        </div>
      </div>
      {category === undefined ? null : null}
    </div>
  );
}
