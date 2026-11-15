import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath, type Dictionary } from "@/lib/i18n";
import { formatDateTime, formatKzt, formatPhone, telHref } from "@/lib/format";
import { getProduct, sameCategoryItems, type VariantDetail } from "@/server/products";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Notice } from "@/components/ui/Feedback";
import { ProductImage } from "@/components/catalog/ProductImage";
import { AvailabilityBadge, PriceBlock, RxBadge } from "@/components/catalog/Offer";
import { FavoriteButton, OfferActions } from "@/components/catalog/OfferActions";
import { ProductGrid, PromoBadges } from "@/components/catalog/ProductCard";
import { SelectPharmacyButton } from "@/components/catalog/SelectPharmacyButton";
import { PharmacyChip } from "@/components/site/HeaderParts";
import { Icon } from "@/components/icons";
import { cn } from "@/components/ui/cn";

function pickVariant(variants: VariantDetail[], sku: unknown): VariantDetail {
  if (typeof sku === "string") {
    const v = variants.find((x) => x.slug === sku);
    if (v) return v;
  }
  return variants[0];
}

function rxLabel(v: VariantDetail, t: Dictionary): string {
  if (v.prescriptionStatus === "PRESCRIPTION") return t.offer.rx;
  if (v.prescriptionStatus === "NON_PRESCRIPTION") return t.offer.otc;
  return t.common.dataPending;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/product/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const product = await getProduct(slug, locale, null);
  if (!product) return {};
  const v = pickVariant(product.variants, (await searchParams).sku);
  const t = getDictionary(locale);
  const desc = [v.fullName, product.brandName, v.form, product.category?.name, t.meta.siteName].filter(Boolean).join(" · ");
  return pageMetadata(locale, `/product/${product.slug}`, v.fullName, desc, { noindex: product.isDemo });
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[locale]/product/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const pharmacy = await getSelectedPharmacy(locale);
  const product = await getProduct(slug, locale, pharmacy?.id ?? null);
  if (!product) notFound();
  const v = pickVariant(product.variants, (await searchParams).sku);
  const related = await sameCategoryItems(product, locale, pharmacy?.id ?? null);
  const href = (p: string) => localizedPath(locale, p);
  const productPath = href(`/product/${product.slug}`);

  const specs: [string, string | null][] = [
    [t.product.brand, product.brandName],
    [t.product.manufacturer, product.manufacturer],
    [t.product.form, v.form],
    [t.product.dosage, v.dosage],
    [t.product.volume, v.volume],
    [t.product.packageSize, v.packageSize],
    [t.product.category, product.category?.name ?? null],
    [t.product.prescriptionStatus, rxLabel(v, t)],
    [t.product.article, v.salamatSku],
    [t.product.barcode, v.barcode],
  ];

  // Structured data: only confirmed product facts, no prices (they depend on the pharmacy).
  const gtin = v.barcode && /^\d{8}$|^\d{12,14}$/.test(v.barcode) ? v.barcode : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: v.fullName,
    sku: v.salamatSku ?? undefined,
    ...(gtin ? { gtin } : {}),
    ...(product.brandName ? { brand: { "@type": "Brand", name: product.brandName } } : {}),
    ...(product.category ? { category: product.category.name } : {}),
    ...(v.imageUrl ? { image: v.imageUrl } : {}),
    url: `${env.appUrl}${productPath}?sku=${v.slug}`,
  };

  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs
        label={t.common.breadcrumbs}
        baseUrl={env.appUrl}
        items={[
          { label: t.common.home, href: href("/") },
          { label: t.catalog.title, href: href("/catalog") },
          ...product.categoryPath.map((c) => ({ label: c.name, href: href(`/catalog/${c.slug}`) })),
          { label: product.name },
        ]}
      />
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        <div className="relative mx-auto w-full max-w-[18rem] self-start md:sticky md:top-36 md:max-w-none">
          <ProductImage src={v.imageUrl} alt={v.fullName} noImageLabel={t.product.noImage} className="rounded-[var(--radius-2xl)] border border-line" priority sizes="(max-width: 1024px) 100vw, 40vw" />
          <div className="absolute top-3 left-3">
            <RxBadge status={v.prescriptionStatus} t={t} />
          </div>
          <FavoriteButton variantId={v.id} className="absolute top-3 right-3 shadow" />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            {product.brandName ? <p className="text-sm font-semibold text-brand-700">{product.brandName}</p> : null}
            <h1 className="mt-1 text-[1.6rem] leading-tight font-bold tracking-tight text-ink sm:text-[2rem]">{v.fullName}</h1>
            <p className="mt-2 text-sm text-muted">
              {product.name}
              {v.form ? ` · ${v.form}` : ""}
            </p>
          </div>

          {product.variants.length > 1 ? (
            <section aria-labelledby="variants-title">
              <h2 id="variants-title" className="font-semibold text-ink">
                {t.product.variants} ({product.variants.length})
              </h2>
              <p className="mb-3 text-sm text-muted">{t.product.variantsHint}</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {product.variants.map((x) => {
                  const current = x.id === v.id;
                  return (
                    <li key={x.id}>
                      <Link
                        href={`${productPath}?sku=${encodeURIComponent(x.slug)}`}
                        aria-current={current ? "true" : undefined}
                        scroll={false}
                        className={cn(
                          "flex h-full items-start gap-3 rounded-[var(--radius-lg)] border p-3 transition-colors",
                          current ? "border-brand-600 bg-brand-50" : "border-line hover:border-brand-600",
                        )}
                      >
                        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", current ? "border-brand-600" : "border-line-strong")} aria-hidden="true">
                          {current ? <span className="size-2.5 rounded-full bg-brand-600" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.95rem] leading-snug font-semibold text-ink">{x.fullName}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {[x.dosage, x.volume, x.packageSize].filter(Boolean).join(" · ")}
                            {x.offer.priceKzt !== null && x.offer.priceState === "confirmed" ? ` · ${formatKzt(x.offer.priceKzt, locale)}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section aria-label={t.product.priceIn} className="rounded-[var(--radius-2xl)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
            <div className="mb-4 border-b border-line pb-4">
              <PharmacyChip compact />
            </div>
            {v.promos.length ? (
              <div className="mb-3">
                <PromoBadges promos={v.promos} t={t} locale={locale} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <PriceBlock offer={v.offer} t={t} locale={locale} size="lg" showUpdated />
              <AvailabilityBadge offer={v.offer} t={t} locale={locale} showUpdated />
            </div>
            {v.offer.rxNotice === "prescription_pickup" ? (
              <Notice tone="warning" className="mt-4">{t.product.rxPickupNotice}</Notice>
            ) : v.offer.rxNotice === "unknown" && v.offer.action !== "no_pharmacy" ? (
              <p className="mt-3 text-sm text-muted">{t.product.unknownRxNotice}</p>
            ) : null}
            {v.offer.action === "no_pharmacy" ? <p className="mt-3 text-sm text-muted">{t.product.selectPharmacyForPrice}</p> : null}
            <div className="mt-5">
              <OfferActions variantId={v.id} fullName={v.fullName} offer={v.offer} layout="page" pharmacyPhone={pharmacy?.phones[0]} />
            </div>
            {pharmacy && pharmacy.phones[0] ? (
              <p className="mt-4 text-sm text-muted">
                {t.pharmacy.phone}:{" "}
                <a href={telHref(pharmacy.phones[0])} className="font-semibold text-brand-700 hover:underline">
                  {formatPhone(pharmacy.phones[0])}
                </a>
              </p>
            ) : null}
          </section>

          <Notice tone="warning" icon="info">
            <p>{t.product.medicalWarning}</p>
            {!product.description ? <p className="mt-1">{t.product.instructionMissing}</p> : null}
          </Notice>

          <section aria-labelledby="specs-title">
            <h2 id="specs-title" className="mb-3 text-lg font-semibold">
              {t.product.characteristics}
            </h2>
            <dl className="divide-y divide-line rounded-[var(--radius-xl)] border border-line">
              {specs
                .filter(([, val]) => val)
                .map(([k, val]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-3 text-[0.95rem]">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium break-words text-ink">{val}</dd>
                  </div>
                ))}
            </dl>
            {v.lastVerifiedAt ? <p className="mt-2 text-xs text-muted">{t.common.updated}: {formatDateTime(v.lastVerifiedAt, locale)}</p> : null}
          </section>

          {product.description ? (
            <section className="prose-salamat">
              <p className="whitespace-pre-line">{product.description}</p>
            </section>
          ) : null}

          <section aria-labelledby="avail-title">
            <h2 id="avail-title" className="mb-3 text-lg font-semibold">
              {t.product.availableIn}
            </h2>
            {v.availableAt.length ? (
              <ul className="divide-y divide-line rounded-[var(--radius-xl)] border border-line">
                {v.availableAt.map((a) => (
                  <li key={a.pharmacyId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <Link href={href(`/pharmacies/${a.slug}`)} className="font-medium text-ink hover:text-brand-700 hover:underline">
                        {a.address}
                      </Link>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm">
                        <Icon name={a.low ? "alert" : "checkCircle"} size={15} className={a.low ? "text-warn-700" : "text-brand-700"} />
                        <span className={a.low ? "text-warn-700" : "text-brand-700"}>{a.low ? t.offer.lowStock : t.offer.inStock}</span>
                        {a.priceKzt !== null ? <span className="font-semibold text-ink"> · {formatKzt(a.priceKzt, locale)}</span> : <span className="text-muted"> · {t.offer.priceUnknown}</span>}
                      </span>
                    </span>
                    {pharmacy?.id !== a.pharmacyId ? <SelectPharmacyButton id={a.pharmacyId} selected={false} label={t.product.selectThisPharmacy} /> : <span className="text-sm font-semibold text-brand-700">{t.pharmacy.selected}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">{t.product.availableInNone}</p>
            )}
          </section>
        </div>
      </div>

      {related.length ? (
        <section aria-labelledby="related-title" className="mt-14">
          <h2 id="related-title" className="text-2xl font-bold">
            {t.product.sameCategory}
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">{t.product.sameCategoryNote}</p>
          <ProductGrid items={related.slice(0, 4)} t={t} locale={locale} pharmacyPhone={pharmacy?.phones[0]} />
        </section>
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
