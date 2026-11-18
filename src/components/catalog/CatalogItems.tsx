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
import { CatalogSearchForm } from "./CatalogSearchForm";
import { FavoriteButton } from "./OfferActions";
import { catalogPhotoSources } from "./ProductImage";

export function catalogItemHref(locale: Locale, id: string) {
  return localizedPath(locale, `/catalog/item/${id}`);
}

export function ItemPrice({ item, t, locale, size = "md" }: { item: CatalogItem; t: Dictionary; locale: Locale; size?: "md" | "lg" }) {
  if (item.price === null) return <p className={size === "lg" ? "text-lg font-semibold text-ink-soft" : "text-sm font-semibold text-ink-soft"}>{t.offer.priceUnknown}</p>;
  return <p className={size === "lg" ? "text-3xl font-bold text-ink tabular-nums" : "text-lg font-bold text-ink tabular-nums"}>{formatKzt(item.price, locale)}</p>;
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

/** Credit line for photos whose licence asks for it (e.g. CC BY-SA: author, licence, link to the source). */
export function PhotoCredit({ item, t, className }: { item: CatalogItem; t: Dictionary; className?: string }) {
  if (!item.imageCredit) return null;
  const credit = item.imageCredit;
  const href = /^https:\/\//.test(credit.url) ? credit.url : null;
  return (
    <p className={`text-[0.72rem] leading-snug text-muted ${className ?? ""}`}>
      {t.items.photoCredit}{" "}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand-700">
          {credit.attribution ?? credit.source}
        </a>
      ) : (
        (credit.attribution ?? credit.source)
      )}
      , {credit.license}. {t.items.packagingMayDiffer}
    </p>
  );
}

function ItemThumb({ item, t }: { item: CatalogItem; t: Dictionary }) {
  if (item.imageUrl) {
    // Lazy: only thumbnails scrolled into view are downloaded; the 400 px variant is enough for a 56 px slot.
    const v = catalogPhotoSources(item.imageUrl);
    return (
      <div className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-line bg-white">
        <picture>
          {v ? <source type="image/avif" srcSet={v.avif} sizes="56px" /> : null}
          <img src={v?.fallback ?? item.imageUrl} srcSet={v?.webp} sizes={v ? "56px" : undefined} alt="" width={56} height={56} loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain p-1" referrerPolicy="no-referrer" />
        </picture>
      </div>
    );
  }
  return (
    <div className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand-50 text-brand-600" role="img" aria-label={t.product.noImage}>
      <Icon name="box" size={24} strokeWidth={1.5} />
    </div>
  );
}

/**
 * Catalogue card: one per unique id. Clear hierarchy — name, article, then price/stock status.
 * On phones a single-column compact card, on wider screens a grid card with an even rhythm.
 */
export function CatalogItemCard({ item, t, locale }: { item: CatalogItem; t: Dictionary; locale: Locale }) {
  const href = catalogItemHref(locale, item.id);
  return (
    <article
      className="group relative flex h-full min-w-0 flex-col gap-3 rounded-[var(--radius-xl)] border border-line bg-white p-4 transition-[box-shadow,border-color] duration-200 hover:border-brand-200 hover:shadow-[var(--shadow-card)]"
      data-item-id={item.id}
    >
      <div className="flex items-start gap-3">
        <ItemThumb item={item} t={t} />
        <div className="min-w-0 flex-1">
          {item.category ? <p className="mb-0.5 text-xs font-semibold text-brand-700">{item.category}</p> : null}
          <h3 className="text-[0.95rem] leading-snug font-semibold break-words text-ink sm:line-clamp-3 sm:min-h-[3.9em]" title={item.name}>
            <Link href={href} className="rounded-sm after:absolute after:inset-0 after:rounded-[var(--radius-xl)] after:content-[''] hover:text-brand-700 focus-visible:outline-none">
              {item.name}
            </Link>
          </h3>
          {item.article ? (
            <p className="mt-1 text-xs text-muted">
              {t.items.article}: <span className="font-mono break-all text-ink-soft">{item.article}</span>
            </p>
          ) : null}
        </div>
        <FavoriteButton variantId={item.id} className="relative z-10 -mt-1 -mr-1 size-10 shrink-0" />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <ItemPrice item={item} t={t} locale={locale} />
          <ItemStock item={item} t={t} />
        </div>
        <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">
          {t.items.details}
          <Icon name="chevronRight" size={16} />
        </span>
      </div>
    </article>
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
        <CatalogSearchForm action={basePath} q={q} />
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
              <ul className="anim-list mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
