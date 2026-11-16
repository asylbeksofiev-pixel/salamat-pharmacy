// Catalogue from public.pharmacy_products: name + article, honest "to be confirmed" price/stock,
// one card per unique id (equal articles never merge cards).
import Link from "next/link";
import type { CatalogItem, CatalogPage } from "@/server/catalog-items";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { formatKzt } from "@/lib/format";
import { Breadcrumbs, type Crumb } from "../ui/Breadcrumbs";
import { Pagination } from "../ui/Pagination";
import { EmptyState, ErrorState, Notice } from "../ui/Feedback";
import { ButtonLink } from "../ui/Button";
import { Icon } from "../icons";
import { ProductImage } from "./ProductImage";

export function catalogItemHref(locale: Locale, id: string) {
  return localizedPath(locale, `/catalog/item/${id}`);
}

export function ItemPrice({ item, t, locale, size = "md" }: { item: CatalogItem; t: Dictionary; locale: Locale; size?: "md" | "lg" }) {
  if (item.price === null) return <p className={size === "lg" ? "text-xl font-semibold text-muted" : "text-base font-semibold text-muted"}>{t.offer.priceUnknown}</p>;
  return <p className={size === "lg" ? "text-3xl font-bold text-ink" : "text-xl font-bold text-ink"}>{formatKzt(item.price, locale)}</p>;
}

export function ItemStock({ item, t }: { item: CatalogItem; t: Dictionary }) {
  if (item.stockQuantity === null)
    return (
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
        <Icon name="question" size={17} />
        {t.offer.stockUnknown}
      </p>
    );
  const inStock = item.stockQuantity > 0;
  return (
    <p className={`flex items-center gap-1.5 text-sm font-semibold ${inStock ? "text-brand-700" : "text-accent-600"}`}>
      <Icon name={inStock ? "checkCircle" : "xCircle"} size={17} />
      {inStock ? t.offer.inStock : t.offer.outOfStock}
    </p>
  );
}

export function CatalogItemCard({ item, t, locale }: { item: CatalogItem; t: Dictionary; locale: Locale }) {
  const href = catalogItemHref(locale, item.id);
  return (
    <article className="group relative flex h-full min-w-0 flex-col gap-3 rounded-[var(--radius-xl)] border border-line bg-white p-3 transition-shadow hover:shadow-[var(--shadow-card)] sm:p-4" data-item-id={item.id}>
      {item.imageUrl ? (
        <ProductImage src={item.imageUrl} alt={item.name} noImageLabel={t.product.noImage} />
      ) : (
        <div className="flex h-20 items-center justify-center rounded-[var(--radius-lg)] bg-gradient-to-br from-surface to-brand-50/60 text-brand-300" aria-hidden="true">
          <Icon name="box" size={30} strokeWidth={1.4} />
        </div>
      )}
      {item.category ? <p className="text-xs font-semibold text-brand-700">{item.category}</p> : null}
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-[0.95rem] leading-snug font-semibold text-ink [overflow-wrap:anywhere] hyphens-auto">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-brand-700 focus-visible:outline-none">
            {item.name}
          </Link>
        </h3>
        {item.article ? (
          <p className="text-xs text-muted">
            {t.items.article}: <span className="font-mono text-ink-soft">{item.article}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <ItemPrice item={item} t={t} locale={locale} />
        <ItemStock item={item} t={t} />
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 group-hover:underline" aria-hidden="true">
          {t.items.details}
          <Icon name="chevronRight" size={16} />
        </span>
      </div>
    </article>
  );
}

export function CatalogSearchForm({ action, q, t }: { action: string; q: string; t: Dictionary }) {
  return (
    <form action={action} method="get" role="search" className="flex w-full max-w-2xl gap-2">
      <label htmlFor="catalog-q" className="sr-only">
        {t.items.searchLabel}
      </label>
      <div className="relative flex-1">
        <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          id="catalog-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          enterKeyHint="search"
          placeholder={t.items.searchPlaceholder}
          className="h-12 w-full rounded-[var(--radius-lg)] border border-line-strong bg-white pr-3 pl-11 text-[0.98rem] placeholder:text-muted/85 focus:border-brand-600 focus:outline-3 focus:outline-offset-0 focus:outline-brand-600/25"
        />
      </div>
      <button type="submit" className="h-12 shrink-0 rounded-[var(--radius-lg)] bg-brand-600 px-5 font-semibold text-white transition-colors hover:bg-brand-700">
        {t.header.searchSubmit}
      </button>
    </form>
  );
}

function pageHref(basePath: string, q: string | null, page: number) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function CatalogItemsView({
  locale,
  t,
  title,
  crumbs,
  basePath,
  q,
  result,
  failed,
  baseUrl,
  before,
  after,
}: {
  locale: Locale;
  t: Dictionary;
  title: string;
  crumbs: Crumb[];
  basePath: string;
  q: string;
  result: CatalogPage | null;
  failed: boolean;
  baseUrl: string;
  before?: React.ReactNode;
  after?: React.ReactNode;
}) {
  const outOfRange = !!result && result.total > 0 && result.items.length === 0;
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs items={crumbs} label={t.common.breadcrumbs} baseUrl={baseUrl} />
      <h1 className="mt-4 text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.1rem]">{title}</h1>
      <div className="mt-4">
        <CatalogSearchForm action={basePath} q={q} t={t} />
      </div>
      {before}
      {failed || !result ? (
        <div className="mt-6">
          <ErrorState title={t.items.loadError} text={t.items.loadErrorText} action={<ButtonLink href={pageHref(basePath, q || null, 1)}>{t.common.retry}</ButtonLink>} />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted" aria-live="polite">
              {fmt(q ? t.items.totalFound : t.items.total, { count: result.total.toLocaleString(locale === "kk" ? "kk-KZ" : "ru-KZ") })}
              {result.pageCount > 1 && !outOfRange ? ` · ${fmt(t.items.pageOf, { page: result.page, pages: result.pageCount })}` : ""}
            </p>
          </div>
          {result.layoutFixed && result.query ? (
            <Notice tone="info" className="mt-3">
              {fmt(t.search.layoutFixed, { q: result.query })}
            </Notice>
          ) : null}
          <Notice tone="info" className="mt-3">
            {t.items.noPriceNote}
          </Notice>
          {result.items.length ? (
            <>
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {result.items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <CatalogItemCard item={item} t={t} locale={locale} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                hrefFor={(p) => pageHref(basePath, result.query, p)}
                labels={{ nav: t.common.pagination, previous: t.common.previous, next: t.common.next, page: t.common.page }}
              />
            </>
          ) : outOfRange ? (
            <EmptyState className="mt-6" icon="search" title={t.items.pageOutOfRange} action={<ButtonLink href={pageHref(basePath, result.query, 1)}>{t.items.firstPage}</ButtonLink>} />
          ) : (
            <EmptyState
              className="mt-6"
              icon="search"
              title={q ? fmt(t.search.nothingFound, { q }) : t.catalog.emptyTitle}
              text={q ? t.search.nothingFoundHint : t.catalog.emptyCatalog}
              action={q ? <ButtonLink href={basePath} variant="outline">{t.items.allProducts}</ButtonLink> : null}
            />
          )}
        </>
      )}
      {after}
    </div>
  );
}
