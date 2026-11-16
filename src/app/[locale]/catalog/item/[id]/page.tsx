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
import { Notice } from "@/components/ui/Feedback";
import { ItemPrice, ItemStock } from "@/components/catalog/CatalogItems";
import { ProductImage } from "@/components/catalog/ProductImage";
import { PharmacyChip } from "@/components/site/HeaderParts";
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
            <div className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-2xl)] border border-line bg-gradient-to-br from-surface to-brand-50/60 text-brand-300 md:aspect-square md:h-auto" role="img" aria-label={`${item.name}. ${t.product.noImage}`}>
              <Icon name="box" size={34} strokeWidth={1.3} />
              <span className="text-xs font-medium text-muted">{t.product.noImage}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            {item.category ? <p className="text-sm font-semibold text-brand-700">{item.category}</p> : null}
            <h1 className="mt-1 text-[1.6rem] leading-tight font-bold tracking-tight text-ink [overflow-wrap:anywhere] sm:text-[2rem]">{item.name}</h1>
            {item.article ? (
              <p className="mt-2 text-sm text-muted">
                {t.items.article}: <span className="font-mono text-ink-soft">{item.article}</span>
              </p>
            ) : null}
          </div>
          <section aria-label={t.product.priceIn} className="rounded-[var(--radius-2xl)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="mb-4 border-b border-line pb-4">
              <PharmacyChip compact />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <ItemPrice item={item} t={t} locale={locale} size="lg" />
              <ItemStock item={item} t={t} />
            </div>
            <p className="mt-3 text-sm text-muted">{t.items.requestUnavailable}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={telHref(phone)} className="inline-flex h-13 items-center gap-2 rounded-[var(--radius-md)] bg-brand-600 px-6 font-semibold text-white transition-colors hover:bg-brand-700">
                <Icon name="phone" size={20} />
                {t.items.ask}: {formatPhone(phone)}
              </a>
            </div>
            <p className="mt-3 text-xs text-muted">{pharmacy ? `${t.items.callPharmacy}: ${pharmacy.address}` : t.common.helpline}</p>
          </section>
          <Notice tone="warning" icon="info">
            <p>{t.product.medicalWarning}</p>
            <p className="mt-1">{t.product.instructionMissing}</p>
          </Notice>
          <Link href={href("/catalog")} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-brand-700 hover:underline">
            <Icon name="chevronLeft" size={16} />
            {t.items.allProducts}
          </Link>
        </div>
      </div>
    </div>
  );
}
