"use client";
import Link from "next/link";
import { useState } from "react";
import type { Offer } from "@/lib/offer";
import { fmt } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";
import { cartStore, favoritesStore, useCart, useFavorites, useHydrated } from "@/lib/client/stores";
import { Button, buttonClass } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { useSite } from "../site/SiteProvider";

export function QuantitySelector({ value, onChange, max, labels, size = "md" }: { value: number; onChange: (n: number) => void; max: number; labels: { quantity: string; decrease: string; increase: string }; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-9" : "h-11";
  return (
    <div className={cn("inline-flex items-center rounded-[var(--radius-md)] border border-line-strong bg-white", h)} role="group" aria-label={labels.quantity}>
      <button type="button" className={cn("grid place-items-center text-ink-soft hover:text-brand-700 disabled:opacity-40", size === "sm" ? "size-9" : "size-11")} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={labels.decrease}>
        <Icon name="minus" size={18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        aria-label={labels.quantity}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 1) onChange(Math.min(max, n));
        }}
        className="w-10 [appearance:textfield] bg-transparent text-center font-semibold outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className={cn("grid place-items-center text-ink-soft hover:text-brand-700 disabled:opacity-40", size === "sm" ? "size-9" : "size-11")} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={labels.increase}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function FavoriteButton({ variantId, className }: { variantId: string; className?: string }) {
  const { t } = useSite();
  const hydrated = useHydrated();
  const favs = useFavorites();
  const on = hydrated && favs.includes(variantId);
  // Each click restarts the effect (key): a pop with a small burst when adding, a soft shrink when removing.
  const [fx, setFx] = useState<{ kind: "add" | "remove"; n: number } | null>(null);
  return (
    <button
      type="button"
      onClick={() => {
        const adding = !favs.includes(variantId);
        favoritesStore.toggle(variantId);
        setFx((prev) => ({ kind: adding ? "add" : "remove", n: (prev?.n ?? 0) + 1 }));
      }}
      aria-pressed={on}
      aria-label={on ? t.offer.favoriteRemove : t.offer.favoriteAdd}
      className={cn(
        "sal-fav relative grid size-10 touch-manipulation place-items-center rounded-full bg-white/90 transition-[color,background-color,transform] duration-150 select-none hover:bg-white",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-safe:active:scale-90",
        on ? "text-accent-500" : "text-muted hover:text-accent-500",
        className,
      )}
    >
      <span key={fx?.n ?? 0} className={cn("grid place-items-center", fx?.kind === "add" && "sal-fav-pop", fx?.kind === "remove" && "sal-fav-out")}>
        <Icon name={on ? "heartFilled" : "heart"} size={20} />
      </span>
      {fx?.kind === "add" ? <span key={`burst-${fx.n}`} className="sal-fav-burst" aria-hidden="true" /> : null}
    </button>
  );
}

/**
 * The single action button for a SKU, chosen by business rules (lib/offer.ts):
 * add to cart / ask the pharmacy / unavailable here / prescription only / choose a pharmacy.
 */
export function OfferActions({
  variantId,
  fullName,
  offer,
  layout = "card",
  pharmacyPhone,
}: {
  variantId: string;
  fullName: string;
  offer: Offer;
  layout?: "card" | "page";
  pharmacyPhone?: string | null;
}) {
  const { t, pharmacy, openPharmacyPicker, href, helpline } = useSite();
  const toast = useToast();
  const hydrated = useHydrated();
  const cart = useCart();
  const [askOpen, setAskOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const inCart = hydrated ? cart.find((l) => l.variantId === variantId) : undefined;
  const full = layout === "page";
  const btnSize = full ? "lg" : "md";
  const width = full ? "w-full sm:w-auto sm:min-w-56" : "w-full";

  if (offer.action === "no_pharmacy") {
    return (
      <Button variant="secondary" size={btnSize} icon="pin" className={width} onClick={openPharmacyPicker}>
        {t.offer.choosePharmacy}
      </Button>
    );
  }
  if (offer.action === "rx_blocked") {
    const phone = pharmacyPhone || helpline;
    return (
      <div className={cn("flex flex-col gap-2", full ? "" : "text-sm")}>
        {full ? <p className="text-sm text-ink-soft">{t.product.rxBlocked}</p> : null}
        <a href={telHref(phone)} className={buttonClass("outline", btnSize, width)}>
          <Icon name="phone" size={18} />
          {full ? formatPhone(phone) : t.offer.rx}
        </a>
      </div>
    );
  }
  if (offer.action === "unavailable") {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="outline" size={btnSize} className={width} disabled>
          {t.offer.notAvailableHere}
        </Button>
        {!full ? (
          <button type="button" onClick={openPharmacyPicker} className="text-sm font-semibold text-brand-700 hover:underline">
            {t.header.changePharmacy}
          </button>
        ) : null}
      </div>
    );
  }
  if (inCart) {
    return (
      <div className={cn("flex items-center gap-2", full ? "flex-wrap" : "")}>
        <Link href={href("/cart")} className={buttonClass("secondary", btnSize, full ? "sm:min-w-44" : "flex-1")}>
          <Icon name="check" size={18} />
          {t.offer.inCart}
        </Link>
        {full ? (
          <QuantitySelector
            value={inCart.quantity}
            max={10}
            onChange={(n) => cartStore.setQuantity(variantId, n)}
            labels={{ quantity: t.offer.quantity, decrease: t.offer.decrease, increase: t.offer.increase }}
          />
        ) : null}
      </div>
    );
  }

  const add = (seenPrice: number | null, message: string) => {
    cartStore.add({ variantId, name: fullName, seenPriceKzt: seenPrice }, full ? qty : 1);
    toast(message, "success", { label: t.common.cart, href: href("/cart") });
  };

  if (offer.action === "add") {
    return (
      <div className={cn("flex items-center gap-2", full ? "flex-wrap" : "")}>
        {full ? (
          <QuantitySelector value={qty} max={offer.quantity !== null ? Math.max(1, Math.min(10, offer.quantity)) : 10} onChange={setQty} labels={{ quantity: t.offer.quantity, decrease: t.offer.decrease, increase: t.offer.increase }} />
        ) : null}
        <Button size={btnSize} icon="cart" className={full ? "sm:min-w-52" : "w-full"} onClick={() => add(offer.priceKzt, t.offer.added)}>
          {t.offer.addToCart}
        </Button>
      </div>
    );
  }

  // "ask": price or stock unknown/stale — the item goes into the request and the operator confirms.
  return (
    <>
      <Button variant="outline" size={btnSize} icon="question" className={width} onClick={() => setAskOpen(true)}>
        {t.offer.ask}
      </Button>
      <Modal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        title={t.offer.askTitle}
        closeLabel={t.common.close}
        footer={
          <>
            <Button variant="outline" onClick={() => setAskOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={() => {
                add(null, t.offer.askAdded);
                setAskOpen(false);
              }}
            >
              {t.offer.askConfirm}
            </Button>
          </>
        }
      >
        <p className="font-semibold text-ink">{fullName}</p>
        <p className="mt-2 text-ink-soft">{fmt(t.offer.askText, { pharmacy: pharmacy?.address ?? "" })}</p>
      </Modal>
    </>
  );
}
