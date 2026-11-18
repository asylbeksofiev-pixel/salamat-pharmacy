import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { formatPhone, telHref } from "@/lib/format";
import { getCatalogItem, isCatalogId } from "@/server/catalog-items";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { getSettings } from "@/server/settings";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ItemPrice, ItemStock, PhotoCredit } from "@/components/catalog/CatalogItems";
import { ProductImage } from "@/components/catalog/ProductImage";
import { PharmacyChip } from "@/components/site/HeaderParts";
import { CatalogCartButton, FavoriteButton } from "@/components/catalog/OfferActions";
import { getStorefrontState } from "@/server/storefront";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]/catalog/item/[id]">) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isCatalogId(id)) return {};
  const item = await getCatalogItem(id);
  if (!item) return {};
  const t = getDictionary(locale);
  const desc = [item.name, item.article ? `${t.items.article}: ${item.article}` : null, t.meta.siteName].filter(Boolean).join(" · ");
  return pageMetadata(locale, `/catalog/item/${item.id}`, item.name, desc);
}

export default async function CatalogItemPage({ params }: PageProps<"/[locale]/catalog/item/[id]">) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isCatalogId(id)) notFound();
  const t = getDictionary(locale);
  const [item, pharmacy, settings, store] = await Promise.all([getCatalogItem(id), getSelectedPharmacy(locale), getSettings(), getStorefrontState()]);
  if (!item) notFound();
  const href = (p: string) => localizedPath(locale, p);
  // A selected pharmacy without a known phone falls back to the helpline, and says so.
  const pharmacyPhone = pharmacy?.phones[0] ?? null;
  const phone = pharmacyPhone ?? settings.helpline.phone;
  const known = item.price !== null || item.stockQuantity !== null;
  const callLabel = pharmacyPhone ? t.items.callPharmacy : t.common.callHelpline;
  return (
    <div className="container-page py-5 md:py-8">
      <Breadcrumbs
        label={t.common.breadcrumbs}
        baseUrl={env.appUrl}
        items={[{ label: t.common.home, href: href("/") }, { label: t.catalog.title, href: href("/catalog") }, { label: item.name }]}
      />
      <div className="mt-4 grid gap-6 md:mt-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        {/* Photo column on tablets and desktops; on phones the photo sits inside the main block. */}
        <div className="hidden self-start md:block">
          {item.imageUrl ? (
            <>
              <ProductImage src={item.imageUrl} alt={item.name} noImageLabel={t.product.noImage} radius="rounded-[var(--radius-2xl)]" className="border border-line" priority sizes="40vw" />
              <PhotoCredit item={item} t={t} className="mt-2" />
            </>
          ) : (
            <div className="flex h-56 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-2xl)] border border-line bg-gradient-to-br from-surface to-brand-50/60 text-brand-300" role="img" aria-label={`${item.name}. ${t.product.noImage}`}>
              <Icon name="box" size={34} strokeWidth={1.3} />
              <span className="text-xs font-medium text-muted">{t.product.noImage}</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          {/* Main block: what the product is and the main action. */}
          <section aria-labelledby="item-title" className="rounded-[var(--radius-2xl)] border border-line bg-white p-4 sm:p-5">
            {item.imageUrl ? (
              <div className="mx-auto mb-4 w-full max-w-[14rem] md:hidden">
                <ProductImage src={item.imageUrl} alt={item.name} noImageLabel={t.product.noImage} radius="rounded-[var(--radius-xl)]" className="border border-line" priority sizes="60vw" />
                <PhotoCredit item={item} t={t} className="mt-1.5 text-center" />
              </div>
            ) : null}
            <div className="flex items-start gap-3">
              {!item.imageUrl ? (
                <div className="grid size-14 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-brand-50 text-brand-600 md:hidden" role="img" aria-label={t.product.noImage}>
                  <Icon name="box" size={26} strokeWidth={1.5} />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                {item.category ? <p className="text-sm font-semibold text-brand-700">{item.category}</p> : null}
                <h1 id="item-title" className="text-[1.3rem] leading-tight font-bold tracking-tight break-words text-ink sm:text-[1.75rem] md:text-[1.9rem]">
                  {item.name}
                </h1>
                {item.article ? (
                  <p className="mt-1.5 text-sm text-muted">
                    {t.items.article}: <span className="font-mono break-all text-ink-soft">{item.article}</span>
                  </p>
                ) : null}
              </div>
              <FavoriteButton variantId={item.id} className="size-11 shrink-0 border border-line" />
            </div>

            {known ? (
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[var(--radius-lg)] bg-surface px-3 py-2.5">
                  <dt className="text-xs text-muted">{t.product.priceIn}</dt>
                  <dd className="mt-0.5">
                    <ItemPrice item={item} t={t} locale={locale} />
                  </dd>
                </div>
                <div className="rounded-[var(--radius-lg)] bg-surface px-3 py-2.5">
                  <dt className="text-xs text-muted">{t.items.stockLabel}</dt>
                  <dd className="mt-0.5">
                    <ItemStock item={item} t={t} />
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft">
                <Icon name="question" size={16} className="shrink-0 text-muted" />
                {t.items.priceStockUnknown}
              </p>
            )}

            {/* Main action: put the product into a request "to be confirmed"; calling stays as the alternative. */}
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              {store.orderingEnabled ? <CatalogCartButton id={item.id} name={item.name} size="lg" className="sm:w-auto sm:min-w-56" /> : null}
              <a
                href={telHref(phone)}
                aria-label={`${callLabel}: ${formatPhone(phone)}`}
                className={
                  store.orderingEnabled
                    ? "press flex h-13 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-white px-5 font-semibold text-ink hover:border-brand-600 hover:text-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto"
                    : "press flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:inline-flex sm:w-auto"
                }
              >
                <Icon name="phone" size={18} />
                {callLabel}
              </a>
            </div>
            {store.orderingEnabled ? <p className="mt-2.5 text-sm text-muted">{t.request.itemHint}</p> : null}
          </section>

          {/* Where to ask: the pharmacy (or helpline) to call. */}
          <section aria-labelledby="ask-title" className="rounded-[var(--radius-2xl)] bg-surface p-4 sm:p-5">
            <h2 id="ask-title" className="text-xs font-semibold tracking-wide text-muted uppercase">
              {t.items.ask}
            </h2>
            <div className="mt-3 flex flex-col gap-0.5">
              <p className="text-xs text-muted">{pharmacyPhone ? t.items.phoneOf : t.common.helpline}</p>
              <a href={telHref(phone)} className="self-start text-lg font-semibold whitespace-nowrap text-ink tabular-nums hover:text-brand-700">
                {formatPhone(phone)}
              </a>
              {pharmacy ? <p className="text-sm break-words text-ink-soft">{pharmacy.address}</p> : null}
            </div>
            {pharmacy && !pharmacyPhone ? <p className="mt-2 text-sm text-muted">{t.items.noPhoneSelected}</p> : null}
            {!pharmacy ? <p className="mt-2 text-sm text-muted">{t.items.chooseForPhone}</p> : null}
            <div className="mt-3 border-t border-line pt-3">
              <PharmacyChip compact />
            </div>
          </section>

          {/* Product details: only what the catalogue actually holds. */}
          <section aria-labelledby="info-title" className="rounded-[var(--radius-2xl)] border border-line bg-white p-4 sm:p-5">
            <h2 id="info-title" className="text-xs font-semibold tracking-wide text-muted uppercase">
              {t.items.infoTitle}
            </h2>
            <dl className="mt-2 divide-y divide-line text-sm">
              {item.article ? (
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted">{t.items.article}</dt>
                  <dd className="min-w-0 text-right font-mono break-all text-ink">{item.article}</dd>
                </div>
              ) : null}
              {item.category ? (
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted">{t.items.categoryLabel}</dt>
                  <dd className="min-w-0 text-right break-words text-ink">{item.category}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted">{t.product.priceIn}</dt>
                <dd className="text-right">
                  <ItemPrice item={item} t={t} locale={locale} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted">{t.items.stockLabel}</dt>
                <dd className="text-right">
                  <ItemStock item={item} t={t} />
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.items.requestUnavailable}</p>
          </section>

          <Link href={href("/catalog")} className="inline-flex items-center gap-1 self-start py-1 text-sm font-semibold text-brand-700 hover:underline">
            <Icon name="chevronLeft" size={16} />
            {t.items.allProducts}
          </Link>
        </div>
      </div>
    </div>
  );
}
