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
import { ItemPrice, ItemStock } from "@/components/catalog/CatalogItems";
import { ProductImage } from "@/components/catalog/ProductImage";
import { PharmacyChip } from "@/components/site/HeaderParts";
import { FavoriteButton } from "@/components/catalog/OfferActions";
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
  const [item, pharmacy, settings] = await Promise.all([getCatalogItem(id), getSelectedPharmacy(locale), getSettings()]);
  if (!item) notFound();
  const href = (p: string) => localizedPath(locale, p);
  const phone = pharmacy?.phones[0] ?? settings.helpline.phone;
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs
        label={t.common.breadcrumbs}
        baseUrl={env.appUrl}
        items={[{ label: t.common.home, href: href("/") }, { label: t.catalog.title, href: href("/catalog") }, { label: item.name }]}
      />
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        <div className="mx-auto w-full max-w-[18rem] self-start md:max-w-none">
          {item.imageUrl ? (
            <ProductImage src={item.imageUrl} alt={item.name} noImageLabel={t.product.noImage} className="rounded-[var(--radius-2xl)] border border-line" priority sizes="(max-width: 768px) 100vw, 40vw" />
          ) : (
            // Compact placeholder until real photos arrive, so price and actions stay above the fold on phones.
            <div className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-2xl)] border border-line bg-gradient-to-br from-surface to-brand-50/60 text-brand-300 md:h-56" role="img" aria-label={`${item.name}. ${t.product.noImage}`}>
              <Icon name="box" size={34} strokeWidth={1.3} />
              <span className="text-xs font-medium text-muted">{t.product.noImage}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {item.category ? <p className="text-sm font-semibold text-brand-700">{item.category}</p> : null}
              <h1 className="mt-1 text-[1.45rem] leading-tight font-bold tracking-tight break-words text-ink sm:text-[1.9rem]">{item.name}</h1>
              {item.article ? (
                <p className="mt-2 text-sm text-muted">
                  {t.items.article}: <span className="font-mono break-all text-ink-soft">{item.article}</span>
                </p>
              ) : null}
            </div>
            <FavoriteButton variantId={item.id} className="size-11 shrink-0 border border-line" />
          </div>
          <section aria-labelledby="ask-title" className="rounded-[var(--radius-xl)] border border-line bg-white p-4 sm:p-5">
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
              <dt className="text-sm text-muted">{t.product.priceIn}</dt>
              <dd className="justify-self-end text-right sm:justify-self-start sm:text-left">
                <ItemPrice item={item} t={t} locale={locale} />
              </dd>
              <dt className="text-sm text-muted">{t.items.stockLabel}</dt>
              <dd className="justify-self-end sm:justify-self-start">
                <ItemStock item={item} t={t} />
              </dd>
            </dl>
            <div className="mt-4 border-t border-line pt-4">
              <h2 id="ask-title" className="text-sm font-semibold text-ink">
                {t.items.ask}
              </h2>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{pharmacy ? t.items.phoneOf : t.common.helpline}</p>
                  <a href={telHref(phone)} className="text-base font-semibold whitespace-nowrap text-ink tabular-nums hover:text-brand-700">
                    {formatPhone(phone)}
                  </a>
                  {pharmacy ? <p className="mt-0.5 text-xs break-words text-muted">{pharmacy.address}</p> : null}
                </div>
                <a
                  href={telHref(phone)}
                  aria-label={`${t.items.call}: ${formatPhone(phone)}`}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-brand-700 active:scale-[0.97]"
                >
                  <Icon name="phone" size={17} />
                  {t.items.call}
                </a>
              </div>
              {!pharmacy ? <p className="mt-3 text-sm text-muted">{t.items.chooseForPhone}</p> : null}
              <div className="mt-3">
                <PharmacyChip compact />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">{t.items.requestUnavailable}</p>
            </div>
          </section>
          <Link href={href("/catalog")} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-brand-700 hover:underline">
            <Icon name="chevronLeft" size={16} />
            {t.items.allProducts}
          </Link>
        </div>
      </div>
    </div>
  );
}
