import Link from "next/link";
import type { VariantCard } from "@/server/catalog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { formatKzt } from "@/lib/format";
import { AvailabilityBadge, PriceBlock, RxBadge } from "./Offer";
import { FavoriteButton, OfferActions } from "./OfferActions";
import { ProductImage } from "./ProductImage";
import { CARD_FRAME, PRODUCT_GRID } from "./CatalogItems";
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

/** SKU-level card (products with per-pharmacy prices). Same structure as the catalogue card. */
export function ProductCard({ item, t, locale, pharmacyPhone }: { item: VariantCard; t: Dictionary; locale: Locale; pharmacyPhone?: string | null }) {
  const href = productHref(locale, item.productSlug, item.slug);
  const meta = [item.brandName, item.form].filter(Boolean).join(" · ");
  return (
    <article className={CARD_FRAME} data-variant-id={item.id}>
      <div className="relative border-b border-line/70">
        <ProductImage src={item.imageUrl} alt={item.fullName} noImageLabel={t.product.noImage} aspect="aspect-[5/4] lg:aspect-[4/3]" radius="rounded-none" />
        <div className="absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1">
          <RxBadge status={item.prescriptionStatus} t={t} />
        </div>
        <div className="absolute top-2 right-2 z-10">
          <FavoriteButton variantId={item.id} className="size-11 border border-line/80 shadow-sm" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        {item.promos.length ? (
          <div className="relative z-10 mb-1">
            <PromoBadges promos={item.promos} t={t} locale={locale} />
          </div>
        ) : null}
        <h3 className="line-clamp-3 text-[0.9rem] leading-snug font-semibold break-words text-ink sm:text-[0.95rem]" title={item.fullName}>
          <Link href={href} className="after:absolute after:inset-0 after:z-[1] after:content-[''] hover:text-brand-700 focus-visible:outline-none">
            {item.fullName}
          </Link>
        </h3>
        {meta ? <p className="text-xs text-muted">{meta}</p> : null}
        <div className="mt-auto flex flex-col gap-1 pt-2.5">
          <PriceBlock offer={item.offer} minPriceKzt={item.minPriceKzt} priceCount={item.priceCount} t={t} locale={locale} />
          <AvailabilityBadge offer={item.offer} t={t} locale={locale} />
        </div>
        <div className="relative z-10 mt-2.5">
          <OfferActions variantId={item.id} fullName={item.fullName} offer={item.offer} pharmacyPhone={pharmacyPhone} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ items, t, locale, pharmacyPhone }: { items: VariantCard[]; t: Dictionary; locale: Locale; pharmacyPhone?: string | null }) {
  return (
    <ul className={`anim-list ${PRODUCT_GRID}`}>
      {items.map((it) => (
        <li key={it.id} className="min-w-0">
          <ProductCard item={it} t={t} locale={locale} pharmacyPhone={pharmacyPhone} />
        </li>
      ))}
    </ul>
  );
}
