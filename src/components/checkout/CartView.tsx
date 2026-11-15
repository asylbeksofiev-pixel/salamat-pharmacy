"use client";
import Link from "next/link";
import { cartStore } from "@/lib/client/stores";
import { fmt } from "@/lib/i18n/config";
import { formatKzt } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n";
import { useSite } from "../site/SiteProvider";
import { PharmacyChip } from "../site/HeaderParts";
import { Button, ButtonLink } from "../ui/Button";
import { EmptyState, ErrorState, Notice, Skeleton } from "../ui/Feedback";
import { Icon } from "../icons";
import { AvailabilityBadge } from "../catalog/Offer";
import { QuantitySelector } from "../catalog/OfferActions";
import { ProductImage } from "../catalog/ProductImage";
import { useQuote, type ChangeNote } from "./useQuote";
import type { QuoteLine } from "@/server/orders/quote";

export function noteText(n: ChangeNote, t: Dictionary, locale: "ru" | "kk"): string {
  if (n.kind === "removed") return t.cart.removedFromCatalog;
  if (n.kind === "rx") return t.cart.rxBlockedLine;
  if (n.kind === "unavailable") return t.cart.becameUnavailable;
  const show = (v: number | null | undefined) => (v ? formatKzt(v, locale) : t.offer.priceUnknown);
  return fmt(t.cart.priceChanged, { old: show(n.oldPrice), new: show(n.newPrice) });
}

export function LinePrice({ line, t, locale }: { line: QuoteLine; t: Dictionary; locale: "ru" | "kk" }) {
  if (line.unitPriceKzt !== null) {
    return (
      <div className="text-right">
        <p className="font-bold text-ink">{formatKzt(line.lineTotalKzt!, locale)}</p>
        {line.quantity > 1 ? <p className="text-xs text-muted">{formatKzt(line.unitPriceKzt, locale)} × {line.quantity}</p> : null}
      </div>
    );
  }
  return <p className="text-right text-sm font-semibold text-muted">{t.offer.priceUnknown}</p>;
}

export function CartView() {
  const { t, locale, href, pharmacy } = useSite();
  const { lines, quote, loading, error, notes, hydrated, refresh } = useQuote(pharmacy?.id ?? null, locale);

  if (!hydrated) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-6 h-40" />
      </div>
    );
  }
  if (!lines.length) {
    return (
      <div className="container-page py-8">
        <h1 className="text-[1.75rem] font-bold tracking-tight sm:text-[2.1rem]">{t.cart.title}</h1>
        <EmptyState className="mt-6" icon="cart" title={t.cart.empty} text={t.cart.emptyText} action={<ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>} />
      </div>
    );
  }

  const byId = new Map((quote?.lines ?? []).map((l) => [l.variantId, l]));
  const noteList = Object.entries(notes).filter(([id]) => lines.some((l) => l.variantId === id));
  const canCheckout = !!quote && !!quote.pharmacy && quote.pharmacy.acceptsOrders && !quote.hasBlocking && !loading;

  return (
    <div className="container-page py-6 md:py-8">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-[1.75rem] font-bold tracking-tight sm:text-[2.1rem]">
          {t.cart.title} <span className="text-lg font-semibold text-muted">({lines.length})</span>
        </h1>
        <button type="button" onClick={() => cartStore.clear()} className="text-sm font-semibold text-muted hover:text-accent-600">
          {t.cart.clear}
        </button>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label={t.cart.item} className="flex flex-col gap-3">
          {noteList.length ? (
            <Notice tone="warning" title={t.cart.changesNotice}>
              <ul className="mt-1 list-disc pl-5">
                {noteList.map(([id, n]) => (
                  <li key={id}>
                    <span className="font-medium">{lines.find((l) => l.variantId === id)?.name}</span>: {noteText(n, t, locale)}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {error ? <ErrorState title={t.cart.checkFailed} action={<Button onClick={refresh}>{t.common.retry}</Button>} /> : null}
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-xl)] border border-line bg-white">
            {lines.map((l) => {
              const q = byId.get(l.variantId);
              const link = q?.productSlug ? `${href(`/product/${q.productSlug}`)}?sku=${encodeURIComponent(q.variantSlug ?? "")}` : null;
              return (
                <li key={l.variantId} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-4">
                  <div>{link ? <Link href={link} tabIndex={-1} aria-hidden="true"><ProductImage src={q?.imageUrl ?? null} alt={l.name} noImageLabel="" className="rounded-[var(--radius-md)]" /></Link> : <ProductImage src={null} alt={l.name} noImageLabel="" className="rounded-[var(--radius-md)]" />}</div>
                  <div className="min-w-0">
                    <h2 className="leading-snug font-semibold text-ink">{link ? <Link href={link} className="hover:text-brand-700">{q?.fullName ?? l.name}</Link> : (q?.fullName ?? l.name)}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {q?.offer ? <AvailabilityBadge offer={q.offer} t={t} locale={locale} /> : loading ? <span className="text-sm text-muted">{t.cart.checking}</span> : null}
                    </div>
                    {q?.blocking ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-accent-600">
                        <Icon name="alert" size={16} />
                        {q.issues.includes("rx_blocked") ? t.cart.rxBlockedLine : q.issues.includes("removed") ? t.cart.removedFromCatalog : t.cart.becameUnavailable}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-3">
                      <QuantitySelector size="sm" value={l.quantity} max={quote?.limits.maxQtyPerLine ?? 10} onChange={(n) => cartStore.setQuantity(l.variantId, n)} labels={{ quantity: t.offer.quantity, decrease: t.offer.decrease, increase: t.offer.increase }} />
                      <button type="button" onClick={() => cartStore.remove(l.variantId)} className="inline-flex h-9 items-center gap-1 rounded-[var(--radius-md)] px-2 text-sm font-medium text-muted hover:bg-accent-50 hover:text-accent-600">
                        <Icon name="trash" size={16} />
                        {t.common.remove}
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-1">{q ? <LinePrice line={q} t={t} locale={locale} /> : null}</div>
                </li>
              );
            })}
          </ul>
        </section>
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-36">
          <div className="rounded-[var(--radius-xl)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <p className="mb-2 text-sm font-semibold text-ink">{t.cart.pharmacy}</p>
            <PharmacyChip compact />
            {!pharmacy ? <p className="mt-2 text-sm text-warn-700">{t.cart.noPharmacy}</p> : null}
            <div className="mt-5 border-t border-line pt-4" aria-live="polite">
              {loading && !quote ? (
                <p className="text-sm text-muted">{t.cart.checking}</p>
              ) : quote && quote.pharmacy ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-soft">{quote.hasUnpriced ? t.cart.totalPartial : t.cart.total}</span>
                    <span className="text-2xl font-bold">{quote.totalKzt > 0 ? formatKzt(quote.totalKzt, locale) : "—"}</span>
                  </div>
                  {quote.hasUnpriced ? <p className="mt-2 text-sm text-muted">{quote.totalKzt > 0 ? t.cart.unpricedNote : t.cart.totalUnknown}</p> : null}
                </>
              ) : null}
            </div>
            {canCheckout ? (
              <ButtonLink href={href("/checkout")} size="lg" className="mt-5 w-full">
                {t.cart.checkout}
              </ButtonLink>
            ) : (
              <Button size="lg" className="mt-5 w-full" disabled>
                {t.cart.checkout}
              </Button>
            )}
            {quote?.pharmacy && !quote.pharmacy.acceptsOrders ? <p className="mt-2 text-sm text-warn-700">{t.checkout.errors.pharmacyNotAccepting}</p> : null}
            {quote?.hasBlocking ? <p className="mt-2 text-sm text-accent-600">{t.cart.becameUnavailable}</p> : null}
          </div>
          <Notice tone="info">{t.cart.notPaymentNote}</Notice>
        </aside>
      </div>
    </div>
  );
}
