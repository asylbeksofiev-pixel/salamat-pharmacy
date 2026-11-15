// Price and availability display. Never renders 0 ₸ for a missing price and never "in stock" for unknown stock.
import type { Offer } from "@/lib/offer";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { formatDateTime, formatKzt } from "@/lib/format";
import { Icon, type IconName } from "../icons";
import { cn } from "../ui/cn";

export function PriceBlock({
  offer,
  minPriceKzt,
  priceCount,
  t,
  locale,
  size = "md",
  showUpdated = false,
}: {
  offer: Offer;
  minPriceKzt?: number | null;
  priceCount?: number;
  t: Dictionary;
  locale: Locale;
  size?: "md" | "lg";
  showUpdated?: boolean;
}) {
  const big = size === "lg" ? "text-3xl" : "text-xl";
  if (offer.action === "no_pharmacy") {
    if (minPriceKzt && priceCount) {
      return (
        <div>
          <p className={cn(big, "font-bold text-ink")}>
            <span className="text-base font-semibold text-muted">{t.common.from} </span>
            {formatKzt(minPriceKzt, locale)}
          </p>
          <p className="text-xs text-muted">{fmt(t.product.minPrice, { price: formatKzt(minPriceKzt, locale), count: priceCount })}</p>
        </div>
      );
    }
    return <p className="text-base font-semibold text-muted">{t.offer.priceUnknown}</p>;
  }
  if (offer.priceState === "unknown" || offer.priceKzt === null) {
    return <p className="text-base font-semibold text-muted">{t.offer.priceUnknown}</p>;
  }
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn(big, "font-bold", offer.priceState === "stale" ? "text-muted" : "text-ink")}>{formatKzt(offer.priceKzt, locale)}</span>
        {offer.oldPriceKzt ? (
          <span className="text-sm text-muted line-through">
            <span className="sr-only">{t.offer.oldPrice}: </span>
            {formatKzt(offer.oldPriceKzt, locale)}
          </span>
        ) : null}
      </p>
      {offer.priceState === "stale" ? (
        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warn-700">
          <Icon name="clock" size={14} />
          {t.offer.priceStale}
        </p>
      ) : null}
      {showUpdated && offer.priceUpdatedAt ? (
        <p className="mt-0.5 text-xs text-muted">{fmt(t.product.priceUpdated, { date: formatDateTime(offer.priceUpdatedAt, locale) })}</p>
      ) : null}
    </div>
  );
}

const STOCK: Record<Offer["stockState"], { icon: IconName; cls: string; key: keyof Dictionary["offer"] }> = {
  in_stock: { icon: "checkCircle", cls: "text-brand-700", key: "inStock" },
  low: { icon: "alert", cls: "text-warn-700", key: "lowStock" },
  out: { icon: "xCircle", cls: "text-accent-600", key: "outOfStock" },
  on_request: { icon: "clock", cls: "text-info-700", key: "onRequest" },
  unknown: { icon: "question", cls: "text-muted", key: "stockUnknown" },
  stale: { icon: "clock", cls: "text-warn-700", key: "stockStale" },
};

export function AvailabilityBadge({ offer, t, locale, showUpdated = false }: { offer: Offer; t: Dictionary; locale: Locale; showUpdated?: boolean }) {
  if (offer.action === "no_pharmacy") return null;
  const s = STOCK[offer.stockState];
  return (
    <div>
      <p className={cn("flex items-center gap-1.5 text-sm font-semibold", s.cls)}>
        <Icon name={s.icon} size={17} />
        {t.offer[s.key]}
      </p>
      {showUpdated && offer.stockUpdatedAt && offer.stockState !== "unknown" ? (
        <p className="mt-0.5 text-xs text-muted">{fmt(t.product.stockUpdated, { date: formatDateTime(offer.stockUpdatedAt, locale) })}</p>
      ) : null}
    </div>
  );
}

export function RxBadge({ status, t }: { status: "PRESCRIPTION" | "NON_PRESCRIPTION" | "UNKNOWN"; t: Dictionary }) {
  if (status !== "PRESCRIPTION") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-bold text-accent-700">
      <Icon name="file" size={13} />
      {t.offer.rx}
    </span>
  );
}
