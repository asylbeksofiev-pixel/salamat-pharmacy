import Link from "next/link";
import type { VariantCard } from "@/server/catalog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { formatKzt } from "@/lib/format";
import { AvailabilityBadge, PriceBlock, RxBadge } from "./Offer";
import { FavoriteButton, OfferActions } from "./OfferActions";
import { ProductImage } from "./ProductImage";
import { Icon } from "../icons";

export function productHref(locale: Locale, productSlug: string, variantSlug: string) {
  return `${localizedPath(locale, `/product/${productSlug}`)}?sku=${encodeURIComponent(variantSlug)}`;
}

export function PromoBadges({ promos, t, locale }: { promos: VariantCard["promos"]; t: Dictionary; locale: Locale }) {
  if (!promos.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {promos.slice(0, 2).map((p) => {
        // A bonus is never shown as a price: it is a separate badge with its own wording.
        const value = p.benefitValue ? (p.benefitUnit === "PERCENT" ? `${p.benefitValue}%` : formatKzt(p.benefitValue, locale)) : "";
        const label = p.type === "BONUS" ? fmt(t.offer.bonus, { value }).trim() : p.type === "DISCOUNT" && value ? `−${value}` : t.offer.promo;
        return (
          <Link key={p.slug} href={localizedPath(locale, `/promotions/${p.slug}`)} title={p.title} className={p.type === "BONUS" ? "inline-flex items-center gap-1 rounded-full bg-info-50 px-2 py-0.5 text-xs font-bold text-info-700 hover:underline" : "inline-flex items-center gap-1 rounded-full bg-accent-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-accent-600"}>
            <Icon name={p.type === "BONUS" ? "gift" : "tag"} size={13} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function ProductCard({ item, t, locale, pharmacyPhone }: { item: VariantCard; t: Dictionary; locale: Locale; pharmacyPhone?: string | null }) {
  const href = productHref(locale, item.productSlug, item.slug);
  const meta = [item.brandName, item.form].filter(Boolean).join(" · ");
  return (
    <article className="group relative flex h-full min-w-0 flex-col gap-3 rounded-[var(--radius-xl)] border border-line bg-white p-3 transition-shadow hover:shadow-[var(--shadow-card)] sm:p-4">
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden="true">
          <ProductImage src={item.imageUrl} alt={item.fullName} noImageLabel={t.product.noImage} />
        </Link>
        <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1">
          <RxBadge status={item.prescriptionStatus} t={t} />
        </div>
        <FavoriteButton variantId={item.id} className="absolute top-1.5 right-1.5 z-10 shadow-sm" />
      </div>
      {item.promos.length ? (
        <div className="relative z-10">
          <PromoBadges promos={item.promos} t={t} locale={locale} />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-[0.95rem] leading-snug font-semibold text-ink [overflow-wrap:anywhere] hyphens-auto">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-brand-700 focus-visible:outline-none">
            {item.fullName}
          </Link>
        </h3>
        {meta ? <p className="text-xs text-muted">{meta}</p> : null}
      </div>
      <div className="relative z-10 flex flex-col gap-2">
        <PriceBlock offer={item.offer} minPriceKzt={item.minPriceKzt} priceCount={item.priceCount} t={t} locale={locale} />
        <AvailabilityBadge offer={item.offer} t={t} locale={locale} />
        <OfferActions variantId={item.id} fullName={item.fullName} offer={item.offer} pharmacyPhone={pharmacyPhone} />
      </div>
    </article>
  );
}

export function ProductGrid({ items, t, locale, pharmacyPhone }: { items: VariantCard[]; t: Dictionary; locale: Locale; pharmacyPhone?: string | null }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => (
        <li key={it.id} className="min-w-0">
          <ProductCard item={it} t={t} locale={locale} pharmacyPhone={pharmacyPhone} />
        </li>
      ))}
    </ul>
  );
}
