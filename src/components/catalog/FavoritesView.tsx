"use client";
// Favourites are stored in the browser; cards are rendered from /api/favorites with current offers.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { VariantCard } from "@/server/catalog";
import { useFavorites, useHydrated } from "@/lib/client/stores";
import { useSite } from "../site/SiteProvider";
import { EmptyState, Skeleton } from "../ui/Feedback";
import { ButtonLink } from "../ui/Button";
import { AvailabilityBadge, PriceBlock } from "./Offer";
import { FavoriteButton, OfferActions } from "./OfferActions";
import { ProductImage } from "./ProductImage";

export function FavoritesView() {
  const { t, locale, href, pharmacy } = useSite();
  const hydrated = useHydrated();
  const ids = useFavorites();
  const [items, setItems] = useState<VariantCard[] | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (!hydrated || !key) return;
    const ctrl = new AbortController();
    fetch(`/api/favorites?ids=${encodeURIComponent(key)}&locale=${locale}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { items: VariantCard[] }) => setItems(d.items))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [key, hydrated, locale, pharmacy?.id]);

  return (
    <div className="container-page py-6 md:py-8">
      <h1 className="text-[1.75rem] font-bold tracking-tight sm:text-[2.1rem]">{t.favorites.title}</h1>
      <div className="mt-6">
        {hydrated && !key ? (
          <EmptyState icon="heart" title={t.favorites.empty} text={t.favorites.emptyText} action={<ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>} />
        ) : !hydrated || items === null ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="heart" title={t.favorites.empty} text={t.favorites.emptyText} action={<ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => {
              const link = `${href(`/product/${it.productSlug}`)}?sku=${encodeURIComponent(it.slug)}`;
              return (
                <li key={it.id}>
                  <article className="relative flex h-full flex-col gap-3 rounded-[var(--radius-xl)] border border-line bg-white p-3 sm:p-4">
                    <div className="relative">
                      <Link href={link} tabIndex={-1} aria-hidden="true"><ProductImage src={it.imageUrl} alt={it.fullName} noImageLabel={t.product.noImage} /></Link>
                      <FavoriteButton variantId={it.id} className="absolute top-1.5 right-1.5 shadow-sm" />
                    </div>
                    <h2 className="flex-1 text-[0.95rem] leading-snug font-semibold"><Link href={link} className="hover:text-brand-700">{it.fullName}</Link></h2>
                    <PriceBlock offer={it.offer} minPriceKzt={it.minPriceKzt} priceCount={it.priceCount} t={t} locale={locale} />
                    <AvailabilityBadge offer={it.offer} t={t} locale={locale} />
                    <OfferActions variantId={it.id} fullName={it.fullName} offer={it.offer} pharmacyPhone={pharmacy?.phones[0]} />
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
