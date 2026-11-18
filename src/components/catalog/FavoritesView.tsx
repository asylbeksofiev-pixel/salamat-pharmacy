"use client";
// Favourites are stored in the browser; cards are rendered from /api/favorites with current offers.
import { useEffect, useState } from "react";
import type { VariantCard } from "@/server/catalog";
import type { CatalogItem } from "@/server/catalog-items";
import { CatalogItemGrid, PRODUCT_GRID } from "./CatalogItems";
import { ProductCard } from "./ProductCard";
import { useFavorites, useHydrated } from "@/lib/client/stores";
import { useSite } from "../site/SiteProvider";
import { EmptyState, ErrorState, Skeleton } from "../ui/Feedback";
import { ButtonLink } from "../ui/Button";

export function FavoritesView() {
  const { t, locale, href, pharmacy } = useSite();
  const hydrated = useHydrated();
  const ids = useFavorites();
  const [items, setItems] = useState<VariantCard[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Catalogue products (public.pharmacy_products) have numeric ids; SKU-level products have text ids.
  const key = ids.join(",");
  useEffect(() => {
    if (!hydrated || !key) return;
    const ctrl = new AbortController();
    const cIds = key.split(",").filter((id) => /^\d+$/.test(id));
    const vIds = key.split(",").filter((id) => id && !/^\d+$/.test(id));
    Promise.all([
      cIds.length ? fetch(`/api/catalog/items?ids=${cIds.join(",")}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))) : { items: [] },
      vIds.length ? fetch(`/api/favorites?ids=${encodeURIComponent(vIds.join(","))}&locale=${locale}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))) : { items: [] },
    ])
      .then(([c, v]: [{ items: CatalogItem[] }, { items: VariantCard[] }]) => {
        setCatalog(c.items);
        setItems(v.items);
        setFailed(false);
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError") setFailed(true);
      });
    return () => ctrl.abort();
  }, [key, hydrated, locale, pharmacy?.id]);

  const count = hydrated ? ids.length : 0;
  return (
    <div className="container-page py-6 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2.25rem]">
          {t.favorites.title}
          {count ? <span className="ml-2 align-middle text-lg font-semibold text-muted tabular-nums">{count}</span> : null}
        </h1>
        {count ? (
          <ButtonLink href={href("/catalog")} variant="ghost" size="sm" iconRight="chevronRight">
            {t.items.allProducts}
          </ButtonLink>
        ) : null}
      </div>
      <div className="mt-6">
        {hydrated && !key ? (
          <EmptyState icon="heart" title={t.favorites.empty} text={t.favorites.emptyText} action={<ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>} />
        ) : failed ? (
          <ErrorState title={t.items.loadError} text={t.items.loadErrorText} />
        ) : !hydrated || items === null || catalog === null ? (
          <div className={PRODUCT_GRID} aria-busy="true">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-[var(--radius-xl)]" />)}
          </div>
        ) : items.length === 0 && catalog.length === 0 ? (
          <EmptyState icon="heart" title={t.favorites.empty} text={t.favorites.emptyText} action={<ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>} />
        ) : (
          <div className="flex flex-col gap-4">
            {catalog.length ? <CatalogItemGrid items={catalog} t={t} locale={locale} /> : null}
            {items.length ? (
              <ul className={`anim-list ${PRODUCT_GRID}`}>
                {items.map((it) => (
                  <li key={it.id} className="min-w-0">
                    <ProductCard item={it} t={t} locale={locale} pharmacyPhone={pharmacy?.phones[0]} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
