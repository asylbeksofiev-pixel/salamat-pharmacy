// Catalogue from public.pharmacy_products: name + article, honest "to be confirmed" price/stock,
// one card per unique id (equal articles never merge cards).
import Link from "next/link";
import type { CatalogItem, CatalogPage } from "@/server/catalog-items";
import type { Dictionary, Locale } from "@/lib/i18n";
import { dataLang, fmt, localeTags, localizedPath } from "@/lib/i18n/config";
import { formatKzt } from "@/lib/format";
import { Breadcrumbs, type Crumb } from "../ui/Breadcrumbs";
import { Pagination } from "../ui/Pagination";
import { EmptyState, ErrorState, Notice } from "../ui/Feedback";
import { ButtonLink } from "../ui/Button";
import { Icon } from "../icons";
import { CatalogSearchForm } from "./CatalogSearchForm";
import { DidYouMeanLink } from "./DidYouMeanLink";
import { ItemFilters, ItemSort, type SectionOption, type SortOption } from "./ItemFilters";
import { activeFilterCount, catalogQueryString, type CatalogQuery } from "@/lib/catalog-params";
import { CatalogCartButton, FavoriteButton } from "./OfferActions";
import { ProductImage } from "./ProductImage";

export function catalogItemHref(locale: Locale, id: string) {
  return localizedPath(locale, `/catalog/item/${id}`);
}

export function ItemPrice({ item, t, locale, size = "md" }: { item: CatalogItem; t: Dictionary; locale: Locale; size?: "md" | "lg" }) {
  if (item.price === null) return <p className={size === "lg" ? "text-lg font-semibold text-ink-soft" : "text-sm font-semibold text-ink-soft"}>{t.offer.priceUnknown}</p>;
  return <p className={size === "lg" ? "text-3xl font-bold text-ink tabular-nums" : "text-lg font-bold text-ink tabular-nums sm:text-xl"}>{formatKzt(item.price, locale)}</p>;
}

export function ItemStock({ item, t, size = "md" }: { item: CatalogItem; t: Dictionary; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-base" : "text-sm";
  if (item.stockQuantity === null)
    return (
      <p className={`flex items-center gap-1.5 font-medium text-muted ${cls}`}>
        <Icon name="question" size={size === "lg" ? 18 : 16} className="shrink-0" />
        {t.offer.stockUnknown}
      </p>
    );
  const inStock = item.stockQuantity > 0;
  return (
    <p className={`flex items-center gap-1.5 font-semibold ${cls} ${inStock ? "text-brand-700" : "text-accent-600"}`}>
      <Icon name={inStock ? "checkCircle" : "xCircle"} size={size === "lg" ? 18 : 16} className="shrink-0" />
      {inStock ? t.offer.inStock : t.offer.outOfStock}
    </p>
  );
}

/** Attribution for photos found in open databases (their CC BY-SA licence requires it). */
export function PhotoCredit({ item, t, className }: { item: CatalogItem; t: Dictionary; className?: string }) {
  if (!item.imageCredit) return null;
  return (
    <p className={`text-[0.72rem] leading-snug text-muted ${className ?? ""}`}>
      {t.items.photoCredit}{" "}
      <a href={item.imageCredit.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand-700">
        {item.imageCredit.source}
      </a>
      , {item.imageCredit.license}. {t.items.packagingMayDiffer}
    </p>
  );
}

/** Grid shared by all product lists: 2 columns on phones, 3 on tablets, 4 on wide screens. */
export const PRODUCT_GRID = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4";

/** Card frame shared by catalogue and SKU cards (hover/focus states live in globals.css → .sal-card). */
export const CARD_FRAME =
  "sal-card group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-white";

/**
 * Catalogue card: one per unique id. Large photo area (or the SALAMAT placeholder) on top, then the name,
 * the SALAMAT article, the price — only when it is really known — and the main action.
 * The whole card opens the product; the heart and the cart button sit above that link.
 */
export function CatalogItemCard({ item, t, locale, priority = false }: { item: CatalogItem; t: Dictionary; locale: Locale; priority?: boolean }) {
  const href = catalogItemHref(locale, item.id);
  return (
    <article className={CARD_FRAME} data-item-id={item.id}>
      <div className="relative border-b border-line/70">
        <ProductImage src={item.imageUrl} alt={item.name} noImageLabel={t.product.noImage} aspect="aspect-[5/4] lg:aspect-[4/3]" radius="rounded-none" priority={priority} />
        <div className="absolute top-2 right-2 z-10">
          <FavoriteButton variantId={item.id} className="size-11 border border-line/80 shadow-sm" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        {item.category ? <p className="truncate text-xs font-semibold text-brand-700">{item.category}</p> : null}
        <h3 className="line-clamp-3 text-[0.9rem] leading-snug font-semibold break-words text-ink sm:text-[0.95rem]" title={item.name} lang={dataLang(locale, item.name)}>
          <Link href={href} className="after:absolute after:inset-0 after:z-[1] after:content-[''] hover:text-brand-700 focus-visible:outline-none">
            {item.name}
          </Link>
        </h3>
        {item.article ? (
          <p className="text-xs text-muted">
            {t.items.article}: <span className="font-mono break-all text-ink-soft">{item.article}</span>
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-0.5 pt-2.5">
          <ItemPrice item={item} t={t} locale={locale} />
          {item.stockQuantity !== null ? <ItemStock item={item} t={t} /> : null}
        </div>
        <div className="relative z-10 mt-2.5">
          <CatalogCartButton id={item.id} name={item.name} />
        </div>
      </div>
    </article>
  );
}

/**
 * A list of catalogue cards. Only the first rows get the entrance animation (see .anim-list); with `reveal`
 * (home page) cards rise in when scrolled into view instead (HomeScrollMotion).
 */
export function CatalogItemGrid({ items, t, locale, className, reveal = false, grid = PRODUCT_GRID }: { items: CatalogItem[]; t: Dictionary; locale: Locale; className?: string; reveal?: boolean; grid?: string }) {
  return (
    <ul className={`${reveal ? "sal-home-grid" : "anim-list"} ${grid} ${className ?? ""}`}>
      {items.map((item, i) => (
        <li key={item.id} className="min-w-0" data-home-reveal={reveal || undefined}>
          <CatalogItemCard item={item} t={t} locale={locale} priority={i < 2} />
        </li>
      ))}
    </ul>
  );
}

export interface CatalogFiltersConfig {
  sectionMode: "multi" | "links";
  sections: SectionOption[];
  /** For sectionMode "links": the current section and where other sections live. */
  currentSection?: string | null;
  sectionBase?: string;
  allSectionsHref?: string;
  pricesAvailable: boolean;
  priceRange: { min: number; max: number; minLabel: string; maxLabel: string } | null;
  popularityAvailable: boolean;
}

function sortOptions(t: Dictionary, q: string, cfg: CatalogFiltersConfig): SortOption[] {
  const out: SortOption[] = [];
  if (q) out.push({ value: "relevance", label: t.catalog.sortRelevance });
  out.push({ value: "popular", label: t.catalog.sortPopular, disabled: !cfg.popularityAvailable, hint: t.catalog.popularUnavailable });
  out.push({ value: "price_asc", label: t.catalog.sortPriceAsc, disabled: !cfg.pricesAvailable, hint: t.catalog.priceSortUnavailable });
  out.push({ value: "price_desc", label: t.catalog.sortPriceDesc, disabled: !cfg.pricesAvailable, hint: t.catalog.priceSortUnavailable });
  out.push({ value: "name_asc", label: t.catalog.sortName });
  out.push({ value: "name_desc", label: t.catalog.sortNameDesc });
  return out;
}

/** Parameters a new search keeps (sections, filters and sort), as [name, value] pairs. */
function keptParams(query: CatalogQuery): [string, string][] {
  const out: [string, string][] = query.categories.map((c) => ["category", c]);
  if (query.priceMin !== undefined) out.push(["priceMin", String(query.priceMin)]);
  if (query.priceMax !== undefined) out.push(["priceMax", String(query.priceMax)]);
  if (query.hasPrice) out.push(["hasPrice", "1"]);
  if (query.hasPhoto) out.push(["hasPhoto", "1"]);
  if (query.sort && query.sort !== "relevance") out.push(["sort", query.sort]);
  return out;
}

const NO_FILTERS: Partial<CatalogQuery> = { categories: [], priceMin: undefined, priceMax: undefined, hasPrice: false, hasPhoto: false };

/** Removable chips for the active filters, plus "Reset filters". Plain links: work without JavaScript. */
function FilterChips({ t, locale, basePath, query, cfg }: { t: Dictionary; locale: Locale; basePath: string; query: CatalogQuery; cfg: CatalogFiltersConfig | null }) {
  const nf = (n: number) => n.toLocaleString(localeTags[locale]);
  const chips: { key: string; label: string; href: string }[] = [];
  if (cfg?.sectionMode !== "links") {
    for (const slug of query.categories) {
      const name = cfg?.sections.find((s) => s.slug === slug)?.name ?? slug;
      chips.push({ key: `c-${slug}`, label: name, href: basePath + catalogQueryString(query, { categories: query.categories.filter((c) => c !== slug) }) });
    }
  }
  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    const label =
      query.priceMin !== undefined && query.priceMax !== undefined
        ? fmt(t.catalog.priceChipRange, { min: nf(query.priceMin), max: nf(query.priceMax) })
        : query.priceMin !== undefined
          ? fmt(t.catalog.priceChipFrom, { min: nf(query.priceMin) })
          : fmt(t.catalog.priceChipTo, { max: nf(query.priceMax!) });
    chips.push({ key: "price", label, href: basePath + catalogQueryString(query, { priceMin: undefined, priceMax: undefined }) });
  }
  if (query.hasPrice) chips.push({ key: "hasPrice", label: t.catalog.withPrice, href: basePath + catalogQueryString(query, { hasPrice: false }) });
  if (query.hasPhoto) chips.push({ key: "hasPhoto", label: t.catalog.withPhoto, href: basePath + catalogQueryString(query, { hasPhoto: false }) });
  if (!chips.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={t.catalog.activeFilters} role="group">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          scroll={false}
          className="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pr-2.5 pl-3 text-sm font-medium text-brand-800 hover:border-brand-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label={fmt(t.catalog.removeFilter, { name: c.label })}
        >
          <span className="max-w-[16rem] truncate">{c.label}</span>
          <Icon name="close" size={14} />
        </Link>
      ))}
      <Link href={basePath + catalogQueryString(query, NO_FILTERS)} scroll={false} className="inline-flex min-h-9 items-center rounded-full px-2 text-sm font-semibold text-brand-700 hover:underline">
        {t.catalog.resetFilters}
      </Link>
    </div>
  );
}

export function CatalogItemsView({
  locale,
  t,
  title,
  crumbs,
  basePath,
  query,
  result,
  failed,
  baseUrl,
  filters,
  before,
  after,
}: {
  locale: Locale;
  t: Dictionary;
  title: string;
  crumbs: Crumb[];
  basePath: string;
  query: CatalogQuery;
  result: CatalogPage | null;
  failed: boolean;
  baseUrl: string;
  /** Filter/sort configuration; null hides filters (e.g. when the data has nothing to filter by). */
  filters: CatalogFiltersConfig | null;
  before?: React.ReactNode;
  after?: React.ReactNode;
}) {
  const q = query.q;
  const outOfRange = !!result && result.total > 0 && result.items.length === 0;
  const activeCount = activeFilterCount(filters?.sectionMode === "links" ? { ...query, categories: [] } : query);
  const listQuery: CatalogQuery = { ...query, q: result?.query ?? query.q };
  const href = (overrides: Partial<CatalogQuery> = {}) => basePath + catalogQueryString(listQuery, overrides);
  const pricedFilterWithoutPrices = !!filters && !filters.pricesAvailable && (query.hasPrice || query.priceMin !== undefined || query.priceMax !== undefined);
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs items={crumbs} label={t.common.breadcrumbs} baseUrl={baseUrl} />
      <h1 className="mt-4 text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
      <div className="mt-4">
        <CatalogSearchForm action={basePath} q={q} keep={keptParams(query)} />
      </div>
      {before}
      {failed || !result ? (
        <div className="mt-6">
          <ErrorState title={t.items.loadError} text={t.items.loadErrorText} action={<ButtonLink href={href({ page: 1 })}>{t.common.retry}</ButtonLink>} />
        </div>
      ) : (
        <div className={filters ? "mt-5 lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8" : "mt-5"}>
          {filters ? (
            <aside className="lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
              <div className="hidden lg:block">
                <ItemFilters
                  basePath={basePath}
                  query={query}
                  sectionMode={filters.sectionMode}
                  sections={filters.sections}
                  currentSection={filters.currentSection}
                  sectionLinks={filters.sectionMode === "links" ? { base: filters.sectionBase ?? "", all: filters.allSectionsHref ?? "", search: catalogQueryString({ ...query, categories: [] }) } : undefined}
                  pricesAvailable={filters.pricesAvailable}
                  priceRange={filters.priceRange}
                  activeCount={activeCount}
                  variant="sidebar"
                />
              </div>
            </aside>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              {/* No product counts on the site (by request): search, filters, sorting and pagination stay. */}
              <span aria-hidden="true" />
              {filters ? (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <div className="lg:hidden">
                    <ItemFilters
                      basePath={basePath}
                      query={query}
                      sectionMode={filters.sectionMode}
                      sections={filters.sections}
                      currentSection={filters.currentSection}
                      sectionLinks={filters.sectionMode === "links" ? { base: filters.sectionBase ?? "", all: filters.allSectionsHref ?? "", search: catalogQueryString({ ...query, categories: [] }) } : undefined}
                      pricesAvailable={filters.pricesAvailable}
                      priceRange={filters.priceRange}
                      activeCount={activeCount}
                      variant="drawer"
                    />
                  </div>
                  <ItemSort basePath={basePath} query={query} options={sortOptions(t, q, filters)} current={result.sort} />
                </div>
              ) : null}
            </div>
            <FilterChips t={t} locale={locale} basePath={basePath} query={query} cfg={filters} />
            {result.layoutFixed && result.query ? (
              <Notice tone="info" className="mt-3">
                {fmt(t.search.layoutFixed, { q: result.query })}
              </Notice>
            ) : null}
            {/* "Did you mean …?" — a link; the visitor's own query and its results stay as they are. */}
            {result.suggestion ? (
              <p className="mt-3 rounded-[var(--radius-md)] border border-brand-100 bg-brand-50 px-3.5 py-2.5 text-[0.95rem] text-ink" data-testid="did-you-mean">
                {t.search.didYouMean}{" "}
                <DidYouMeanLink
                  href={basePath + catalogQueryString({ ...query, q: result.suggestion.query }, { page: 1 })}
                  query={result.suggestion.query}
                  label={fmt(t.search.didYouMeanLink, { q: result.suggestion.query })}
                />
              </p>
            ) : null}
            {!filters?.pricesAvailable ? (
              <Notice tone="info" className="mt-3">
                {t.items.noPriceNote}
              </Notice>
            ) : null}
            {result.items.length ? (
              <>
                <CatalogItemGrid items={result.items} t={t} locale={locale} className="mt-5" grid={filters ? "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" : PRODUCT_GRID} />
                <Pagination
                  page={result.page}
                  pageCount={result.pageCount}
                  hrefFor={(p) => href({ page: p })}
                  labels={{ nav: t.common.pagination, previous: t.common.previous, next: t.common.next, page: t.common.page }}
                />
              </>
            ) : outOfRange ? (
              <EmptyState className="mt-6" icon="search" title={t.items.pageOutOfRange} action={<ButtonLink href={href({ page: 1 })}>{t.items.firstPage}</ButtonLink>} />
            ) : activeCount ? (
              <EmptyState
                className="mt-6"
                icon="filter"
                title={t.catalog.emptyFilteredTitle}
                text={pricedFilterWithoutPrices ? t.catalog.emptyPriceText : t.catalog.emptyFilteredText}
                action={<ButtonLink href={href(NO_FILTERS)} variant="outline">{t.catalog.resetFilters}</ButtonLink>}
              />
            ) : (
              <EmptyState
                className="mt-6"
                icon="search"
                title={q ? fmt(t.search.nothingFound, { q }) : t.catalog.emptyTitle}
                text={q ? t.search.nothingFoundHint : t.catalog.emptyCatalog}
                action={q ? <ButtonLink href={basePath + catalogQueryString({ ...query, q: "" })} variant="outline">{t.items.allProducts}</ButtonLink> : null}
              />
            )}
          </div>
        </div>
      )}
      {after}
    </div>
  );
}
