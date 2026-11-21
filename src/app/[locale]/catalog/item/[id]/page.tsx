import Link from "next/link";
import { notFound } from "next/navigation";
import { dataLang, fmt, getDictionary, isLocale, localizedPath, type Dictionary, type Locale } from "@/lib/i18n";
import { formatPhone, telHref } from "@/lib/format";
import { getCatalogItem, isCatalogId, type CatalogItem } from "@/server/catalog-items";
import { productRecommendations, type SimilarBasis } from "@/server/recommendations";
import { nameDetails } from "@/lib/product-features";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { getSettings } from "@/server/settings";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { getStorefrontState } from "@/server/storefront";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { CatalogItemCard, ItemPrice, ItemStock, PhotoCredit } from "@/components/catalog/CatalogItems";
import { CAROUSEL_ITEM, ProductCarousel } from "@/components/catalog/ProductCarousel";
import { ButtonLink } from "@/components/ui/Button";
import { ProductImage, ProductPlaceholder } from "@/components/catalog/ProductImage";
import { ArticleCopy, BackLink, PdpAddedNote, PdpCartAction, ProductGallery, StickyActionBar } from "@/components/catalog/ProductPage";
import { PharmacyChip } from "@/components/site/HeaderParts";
import { FavoriteButton } from "@/components/catalog/OfferActions";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui/cn";

export async function generateMetadata({ params }: PageProps<"/[locale]/catalog/item/[id]">) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isCatalogId(id)) return {};
  const item = await getCatalogItem(id);
  if (!item) return {};
  const t = getDictionary(locale);
  const desc = [item.name, item.article ? `${t.items.article}: ${item.article}` : null, t.meta.siteName].filter(Boolean).join(" · ");
  return pageMetadata(locale, `/catalog/item/${item.id}`, item.name, desc);
}

/** One recommendation section: heading, a short line on what it is based on, and the product carousel. */
function RecommendationRow({ id, title, note, items, t, locale, action }: { id: string; title: string; note: string; items: CatalogItem[]; t: Dictionary; locale: Locale; action?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 md:mt-14">
      <h2 id={id} className="text-[1.35rem] leading-tight font-bold tracking-tight text-ink sm:text-[1.6rem]">
        {title}
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted">{note}</p>
      <ProductCarousel id={`${id}-track`} label={title} prevLabel={t.home.carouselPrev} nextLabel={t.home.carouselNext} action={action}>
        {items.map((n) => (
          <li key={n.id} className={CAROUSEL_ITEM}>
            <CatalogItemCard item={n} t={t} locale={locale} />
          </li>
        ))}
      </ProductCarousel>
    </section>
  );
}

/**
 * Catalogue product page. Phone order: back · photo · name and article · price and availability · pickup pharmacy ·
 * "Add to cart" · call · one line on what happens next · characteristics. On tablets and desktops the photo is on
 * the left (sticky) and the information and actions on the right; details follow below.
 * Only real data is shown: no invented price, stock, description or composition.
 */
export default async function CatalogItemPage({ params }: PageProps<"/[locale]/catalog/item/[id]">) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isCatalogId(id)) notFound();
  const t = getDictionary(locale);
  const [item, pharmacy, settings, store] = await Promise.all([getCatalogItem(id, locale), getSelectedPharmacy(locale), getSettings(), getStorefrontState()]);
  if (!item) notFound();
  const { similar, basis, others } = await productRecommendations(item, locale);
  // Characteristics read from the product name (shown only when the name really contains them).
  const details = nameDetails(item.name);
  const nameRows: { label: string; value: string }[] = [
    ...(details.form ? [{ label: t.product.form, value: t.product.forms[details.form] }] : []),
    ...(details.dosages.length ? [{ label: t.product.dosage, value: details.dosages.join(", ") }] : []),
    ...(details.contents.length ? [{ label: t.product.volume, value: details.contents.join(", ") }] : []),
    ...(details.count !== null ? [{ label: t.product.packageSize, value: fmt(t.product.packCountValue, { count: details.count }) }] : []),
  ];
  const similarNote = (b: SimilarBasis | null) =>
    b === "name" ? t.items.similarNoteName : b === "brand" ? fmt(t.items.similarNoteBrand, { section: item.category ?? "" }) : fmt(t.items.similarNoteType, { section: item.category ?? "" });
  const href = (p: string) => localizedPath(locale, p);
  // A selected pharmacy without a known phone falls back to the helpline, and says so.
  const pharmacyPhone = pharmacy?.phones[0] ?? null;
  const phone = pharmacyPhone ?? settings.helpline.phone;
  const callLabel = pharmacyPhone ? t.items.callPharmacy : t.common.callHelpline;
  const nameLang = dataLang(locale, item.name);
  const photos = item.imageUrl
    ? [<ProductImage key="0" src={item.imageUrl} alt={item.name} noImageLabel={t.product.noImage} aspect="aspect-[5/4] md:aspect-square" radius="" priority sizes="(max-width: 768px) 100vw, 40vw" />]
    : [];

  return (
    <div className="container-page pt-1 pb-10 md:py-8">
      {/* Phones: a compact way back and into the catalogue. Wider screens: breadcrumbs. */}
      <nav className="flex items-center justify-between gap-2 md:hidden" aria-label={t.common.breadcrumbs}>
        <BackLink fallbackHref={href("/catalog")} label={t.common.back} />
        <Link href={href("/catalog")} className="-mr-2 inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <Icon name="grid" size={18} />
          {t.common.catalog}
        </Link>
      </nav>
      <div className="hidden md:block">
        <Breadcrumbs
          label={t.common.breadcrumbs}
          baseUrl={env.appUrl}
          items={[
            { label: t.common.home, href: href("/") },
            { label: t.catalog.title, href: href("/catalog") },
            ...(item.category && item.categorySlug ? [{ label: item.category, href: href(`/catalog/${item.categorySlug}`) }] : []),
            { label: item.name },
          ]}
        />
      </div>

      <div className="mt-1 grid gap-5 md:mt-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-8 lg:gap-12">
        <div className="md:sticky md:top-32 md:self-start">
          <ProductGallery
            photos={photos}
            placeholder={<ProductPlaceholder alt={item.name} label={t.product.noImage} aspect="aspect-[4/3] md:aspect-square" radius="" />}
            name={item.name}
            overlay={<FavoriteButton variantId={item.id} quiet className="size-11 border border-line shadow-sm" />}
            caption={<PhotoCredit item={item} t={t} className="mt-2" />}
          />
        </div>

        <section aria-labelledby="item-title" className="flex min-w-0 flex-col">
          {item.category && item.categorySlug ? (
            <Link href={href(`/catalog/${item.categorySlug}`)} className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-brand-700 hover:underline md:mb-1 md:min-h-0">
              {item.category}
            </Link>
          ) : null}
          <h1 id="item-title" lang={nameLang} className="text-[1.375rem] leading-[1.2] font-bold tracking-tight [overflow-wrap:anywhere] text-ink sm:text-[1.75rem] lg:text-[2rem]">
            {item.name}
          </h1>
          {item.article ? (
            <div className="mt-1.5">
              <ArticleCopy article={item.article} label={t.items.article} />
            </div>
          ) : null}

          {/* Price and availability: one calm block, only real values. */}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted">{t.product.priceIn}</p>
              <div className="mt-0.5">
                <ItemPrice item={item} t={t} locale={locale} size="lg" />
              </div>
            </div>
            <ItemStock item={item} t={t} />
          </div>

          {/* Pickup pharmacy (opens the existing pharmacy picker). */}
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-ink">{t.cart.pharmacy}</p>
            <PharmacyChip compact />
          </div>

          {/* Main action. The sticky bar on phones appears only after this block has scrolled away. */}
          <div id="pdp-main-action" className="mt-5 flex flex-col gap-2.5">
            <PdpCartAction id={item.id} name={item.name} />
            <PdpAddedNote id={item.id} />
            <a
              href={telHref(phone)}
              aria-label={`${callLabel}: ${formatPhone(phone)}`}
              className={cn(
                "press flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-md)] px-3.5 py-2 text-left transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                store.orderingEnabled ? "border border-line-strong bg-white hover:border-brand-600" : "bg-brand-600 text-white hover:bg-brand-700",
              )}
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", store.orderingEnabled ? "bg-brand-50 text-brand-700" : "bg-white/15 text-white")}>
                <Icon name="phone" size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-semibold">{callLabel}</span>
                <span className={cn("block text-sm tabular-nums", store.orderingEnabled ? "text-muted" : "text-white/85")}>{formatPhone(phone)}</span>
              </span>
            </a>
          </div>
          {/* What happens next — explained once. */}
          <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-muted">
            <Icon name="info" size={18} className="mt-0.5 shrink-0 text-brand-600" />
            {store.orderingEnabled ? t.pdp.requestNote : t.items.requestUnavailable}
          </p>
        </section>
      </div>

      {/* Details: only sections that have data. The catalogue holds no description, composition or dosage. */}
      <div className="mt-8 border-t border-line md:mt-10 md:max-w-3xl">
        <details open className="sal-acc group border-b border-line">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {t.product.characteristics}
            <Icon name="chevronDown" size={20} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <dl className="pb-4 text-[0.95rem]">
            {item.article ? (
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-t border-line/70 py-2.5 first:border-t-0">
                <dt className="text-muted">{t.items.article}</dt>
                <dd className="font-mono break-all text-ink">{item.article}</dd>
              </div>
            ) : null}
            {item.category ? (
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-t border-line/70 py-2.5 first:border-t-0">
                <dt className="text-muted">{t.items.categoryLabel}</dt>
                <dd className="break-words text-ink">{item.category}</dd>
              </div>
            ) : null}
            {nameRows.map((r) => (
              <div key={r.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-t border-line/70 py-2.5 first:border-t-0">
                <dt className="text-muted">{r.label}</dt>
                <dd className="break-words text-ink">{r.value}</dd>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 border-t border-line/70 py-2.5 first:border-t-0">
              <dt className="text-muted">{t.checkout.method}</dt>
              <dd className="text-ink">{t.checkout.pickup}</dd>
            </div>
          </dl>
          {nameRows.length ? <p className="pb-4 text-xs text-muted">{t.product.fromName}</p> : null}
        </details>
      </div>

      {/* Recommendations from real catalogue data (src/server/recommendations.ts): products that share the type, brand
          or name, then other products of the section under a neutral heading. Each section is hidden when empty. */}
      {similar.length ? (
        <RecommendationRow id="item-similar" title={t.items.similarTitle} note={similarNote(basis)} items={similar} t={t} locale={locale} />
      ) : null}
      {others.length && item.category ? (
        <RecommendationRow
          id="item-others"
          title={t.items.othersTitle}
          note={fmt(t.items.othersNote, { section: item.category })}
          items={others}
          t={t}
          locale={locale}
          action={
            item.categorySlug ? (
              <ButtonLink href={href(`/catalog/${item.categorySlug}`)} variant="outline" iconRight="chevronRight" wrap className="w-full sm:w-auto">
                {t.items.sectionAll}
              </ButtonLink>
            ) : undefined
          }
        />
      ) : null}

      <StickyActionBar targetId="pdp-main-action" label={t.pdp.actionsLabel}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ItemPrice item={item} t={t} locale={locale} />
            <p className="truncate text-xs text-muted" lang={nameLang}>
              {item.name}
            </p>
          </div>
          <div className="w-[52%] max-w-60 shrink-0">
            <PdpCartAction id={item.id} name={item.name} compact />
          </div>
        </div>
      </StickyActionBar>
    </div>
  );
}
