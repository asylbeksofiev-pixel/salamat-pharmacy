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
              {fmt(q ? t.items.totalFound : t.items.total, { count: result.total.toLocaleString(localeTags[locale]) })}
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
              <CatalogItemGrid items={result.items} t={t} locale={locale} className="mt-5" />
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
