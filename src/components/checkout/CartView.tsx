"use client";
import Link from "next/link";
import { cartStore } from "@/lib/client/stores";
import { dataLang, fmt } from "@/lib/i18n/config";
import { formatKzt } from "@/lib/format";
import type { Dictionary, Locale } from "@/lib/i18n";
import { useSite } from "../site/SiteProvider";
import { PharmacyChip } from "../site/HeaderParts";
import { Button, ButtonLink } from "../ui/Button";
import { EmptyState, ErrorState, Notice, Skeleton } from "../ui/Feedback";
import { Icon } from "../icons";
import { AvailabilityBadge } from "../catalog/Offer";
import { QuantitySelector } from "../catalog/OfferActions";
import { ProductImage } from "../catalog/ProductImage";
import { useQuote, type ChangeNote } from "./useQuote";
import type { Quote, QuoteLine } from "@/server/orders/quote";
import { useToast } from "../ui/Toast";

export function noteText(n: ChangeNote, t: Dictionary, locale: Locale): string {
  if (n.kind === "removed") return t.cart.removedFromCatalog;
  if (n.kind === "rx") return t.cart.rxBlockedLine;
  if (n.kind === "unavailable") return t.cart.becameUnavailable;
  const show = (v: number | null | undefined) => (v ? formatKzt(v, locale) : t.offer.priceUnknown);
  return fmt(t.cart.priceChanged, { old: show(n.oldPrice), new: show(n.newPrice) });
}

export function LinePrice({ line, t, locale }: { line: QuoteLine; t: Dictionary; locale: Locale }) {
  if (line.unitPriceKzt !== null) {
    return (
      <div className="text-right">
        <p className="font-bold text-ink tabular-nums">{formatKzt(line.lineTotalKzt!, locale)}</p>
        {line.quantity > 1 ? <p className="text-xs text-muted tabular-nums">{formatKzt(line.unitPriceKzt, locale)} × {line.quantity}</p> : null}
      </div>
    );
  }
  return <p className="text-right text-sm font-semibold text-ink-soft">{line.blocking ? "—" : t.request.priceByPharmacy}</p>;
}

/** Link to a cart line's product page: SKU page for variants, catalogue page for catalogue products. */
export function lineHref(href: (p: string) => string, variantId: string, q: QuoteLine | undefined): string | null {
  if (q?.kind === "catalog") return q.blocking && q.issues.includes("removed") ? null : href(`/catalog/item/${variantId}`);
  if (q?.productSlug) return `${href(`/product/${q.productSlug}`)}?sku=${encodeURIComponent(q.variantSlug ?? "")}`;
  return null;
}

/** Totals: a sum only from confirmed prices, and a plain explanation when it cannot be calculated yet. */
export function QuoteTotals({ quote, t, locale }: { quote: Quote; t: Dictionary; locale: Locale }) {
  const hasSum = quote.totalKzt > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-soft">{hasSum ? (quote.hasUnpriced ? t.cart.totalPartial : t.cart.total) : t.cart.total}</span>
        <span className={hasSum ? "text-2xl font-bold tabular-nums" : "text-right text-base font-semibold text-ink-soft"}>{hasSum ? formatKzt(quote.totalKzt, locale) : t.request.totalAfterCall}</span>
      </div>
      {quote.hasUnpriced ? <p className="mt-2 text-sm text-muted">{hasSum ? t.cart.unpricedNote : t.request.totalCannotCompute}</p> : null}
    </div>
  );
}

export function CartView() {
  const { t, locale, href, pharmacy, openPharmacyPicker } = useSite();
  const toast = useToast();
  const { lines, quote, loading, error, notes, hydrated, refresh } = useQuote(pharmacy?.id ?? null, locale);

  if (!hydrated) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-10 w-48" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
          <Skeleton className="h-64 rounded-[var(--radius-xl)]" />
        </div>
      </div>
    );
  }
  if (!lines.length) {
    return (
      <div className="container-page py-6 md:py-10">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">{t.cart.title}</h1>
        <EmptyState
          className="mt-6"
          icon="cart"
          title={t.cart.empty}
          text={t.cart.emptyText}
          action={
            <>
              <ButtonLink href={href("/catalog")}>{t.cart.toCatalog}</ButtonLink>
              <ButtonLink href={href("/favorites")} variant="outline" icon="heart">
                {t.common.favorites}
              </ButtonLink>
            </>
          }
        />
      </div>
    );
  }

  const byId = new Map((quote?.lines ?? []).map((l) => [l.variantId, l]));
  const noteList = Object.entries(notes).filter(([id]) => lines.some((l) => l.variantId === id));
  const canCheckout = !!quote && !!quote.pharmacy && quote.pharmacy.acceptsOrders && !quote.hasBlocking && !loading;
  const pharmacyLabel = quote?.pharmacy?.address ?? pharmacy?.address ?? null;

  return (
    <div className="container-page py-6 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">
          {t.cart.title} <span className="align-middle text-lg font-semibold text-muted tabular-nums">{lines.length}</span>
        </h1>
        <button type="button" onClick={() => cartStore.clear()} className="inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-2 text-sm font-semibold text-muted hover:bg-accent-50 hover:text-accent-600">
          <Icon name="trash" size={16} />
          {t.cart.clear}
        </button>
      </div>
      {quote?.hasUnpriced ? (
        <Notice tone="info" title={t.request.modeTitle} className="mt-4">
          {t.request.modeText}
        </Notice>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
        <section aria-label={t.request.lines} className="flex min-w-0 flex-col gap-3">
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
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[var(--radius-xl)] border border-line bg-white">
            {lines.map((l) => {
              const q = byId.get(l.variantId);
              const link = lineHref(href, l.variantId, q);
              const name = q && q.fullName !== "—" ? q.fullName : l.name;
              const thumb = <ProductImage src={q?.imageUrl ?? null} alt={name} noImageLabel="" compact radius="rounded-[var(--radius-md)]" className="border border-line" sizes="96px" />;
              return (
                <li key={l.variantId} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:p-5">
                  <div className="row-span-2 sm:row-span-1">{link ? <Link href={link} tabIndex={-1} aria-hidden="true">{thumb}</Link> : thumb}</div>
                  <div className="min-w-0">
                    <h2 className="text-[0.98rem] leading-snug font-semibold break-words text-ink" lang={dataLang(locale, name)}>{link ? <Link href={link} className="hover:text-brand-700">{name}</Link> : name}</h2>
                    {q?.article ? (
                      <p className="mt-0.5 text-xs text-muted">
                        {t.items.article}: <span className="font-mono break-all text-ink-soft">{q.article}</span>
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {q?.offer ? (
                        <AvailabilityBadge offer={q.offer} t={t} locale={locale} />
                      ) : q?.kind === "catalog" && !q.blocking ? (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
                          <Icon name="question" size={16} className="shrink-0" />
                          {t.offer.stockUnknown}
                        </p>
                      ) : loading && !q ? (
                        <span className="text-sm text-muted">{t.cart.checking}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
                      <Icon name="pin" size={14} className="mt-px shrink-0 text-brand-600" />
                      <span className="min-w-0 break-words">{pharmacyLabel ? fmt(t.request.pharmacyLine, { pharmacy: pharmacyLabel }) : t.request.noPharmacy}</span>
                    </p>
                    {q?.blocking ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-accent-600">
                        <Icon name="alert" size={16} />
                        {q.issues.includes("rx_blocked") ? t.cart.rxBlockedLine : q.issues.includes("removed") ? t.cart.removedFromCatalog : t.cart.becameUnavailable}
                      </p>
                    ) : null}
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center justify-between gap-3 sm:col-start-auto sm:row-span-1 sm:flex-col sm:items-end sm:justify-start">
                    {q ? <LinePrice line={q} t={t} locale={locale} /> : null}
                    <div className="flex items-center gap-1">
                      <QuantitySelector size="sm" value={l.quantity} max={quote?.limits.maxQtyPerLine ?? 10} onChange={(n) => cartStore.setQuantity(l.variantId, n)} labels={{ quantity: t.offer.quantity, decrease: t.offer.decrease, increase: t.offer.increase }} />
                      <button
                        type="button"
                        onClick={() => {
                          cartStore.remove(l.variantId);
                          toast(t.request.removed, "info");
                        }}
                        className="grid size-11 place-items-center rounded-[var(--radius-md)] text-muted transition-colors hover:bg-accent-50 hover:text-accent-600"
                        aria-label={`${t.common.remove}: ${name}`}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link href={href("/catalog")} className="inline-flex items-center gap-1 self-start py-2 text-sm font-semibold text-brand-700 hover:underline">
            <Icon name="chevronLeft" size={16} />
            {t.cart.toCatalog}
          </Link>
        </section>
        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-36">
          <div className="rounded-[var(--radius-xl)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
            <h2 className="text-lg font-semibold">{t.request.summary}</h2>
            <p className="mt-0.5 text-sm text-muted">{fmt(t.request.positions, { count: lines.length })}</p>
            <p className="mt-4 mb-2 text-sm font-semibold text-ink">{t.cart.pharmacy}</p>
            <PharmacyChip compact />
            {!pharmacy ? <p className="mt-2 text-sm text-warn-700">{t.request.choosePharmacy}</p> : null}
            <div className="mt-5 border-t border-line pt-4" aria-live="polite">
              {loading && !quote ? <p className="text-sm text-muted">{t.cart.checking}</p> : quote ? <QuoteTotals quote={quote} t={t} locale={locale} /> : null}
            </div>
            {canCheckout ? (
              <ButtonLink href={href("/checkout")} size="lg" className="mt-5 w-full" iconRight="chevronRight">
                {t.request.toCheckout}
              </ButtonLink>
            ) : !pharmacy ? (
              <Button size="lg" icon="pin" className="mt-5 w-full" onClick={openPharmacyPicker}>
                {t.offer.choosePharmacy}
              </Button>
            ) : (
              <Button size="lg" className="mt-5 w-full" disabled>
                {t.request.toCheckout}
              </Button>
            )}
            {quote?.pharmacy && !quote.pharmacy.acceptsOrders ? <p className="mt-2 text-sm text-warn-700">{t.checkout.errors.pharmacyNotAccepting}</p> : null}
            {quote?.hasBlocking ? <p className="mt-2 text-sm text-accent-600">{t.cart.becameUnavailable}</p> : null}
            <p className="mt-4 text-xs leading-relaxed text-muted">{t.cart.notPaymentNote}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
