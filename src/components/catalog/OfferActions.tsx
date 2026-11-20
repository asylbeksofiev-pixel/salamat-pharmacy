"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Offer } from "@/lib/offer";
import { fmt } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";
import { cartStore, favoritesStore, useCart, useFavorites, useHydrated } from "@/lib/client/stores";
import { flyToCart } from "@/lib/client/fly-to-cart";
import { Button, buttonClass } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { useSite } from "../site/SiteProvider";

export function QuantitySelector({ value, onChange, max, labels, size = "md" }: { value: number; onChange: (n: number) => void; max: number; labels: { quantity: string; decrease: string; increase: string }; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-9" : size === "lg" ? "h-13" : "h-11";
  const btn = size === "sm" ? "size-9" : size === "lg" ? "h-13 w-12" : "size-11";
  return (
    <div className={cn("inline-flex items-center rounded-[var(--radius-md)] border border-line-strong bg-white", h)} role="group" aria-label={labels.quantity}>
      <button type="button" className={cn("grid place-items-center text-ink-soft transition-[color,scale] duration-150 hover:text-brand-700 disabled:opacity-40 motion-safe:active:scale-90", btn)} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label={labels.decrease}>
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
      <button type="button" className={cn("grid place-items-center text-ink-soft transition-[color,scale] duration-150 hover:text-brand-700 disabled:opacity-40 motion-safe:active:scale-90", btn)} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={labels.increase}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/** Most units of one product in a request (same as the server's default checkout.maxQtyPerLine). */
export const MAX_QTY = 10;

/**
 * Compact "− 1 +" control shown once a product is in the cart (cards, product page, cart page).
 * "+" adds a unit, "−" removes one; with `removeAtOne` the "−" at 1 takes the product out of the cart, and the
 * caller then shows the original "Add to cart" button again. Limits use aria-disabled (not disabled), so keyboard
 * focus stays on the button. The number is announced politely and slides in the direction of the change.
 */
export function CartStepper({
  value,
  max = MAX_QTY,
  name,
  onChange,
  onRemove,
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  /** Product name for the screen-reader labels ("Increase quantity: Paracetamol…"). */
  name: string;
  onChange: (n: number) => void;
  /** When given, "−" at 1 removes the product instead of being unavailable. */
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { t } = useSite();
  // Direction of the last change, derived during render (no effect, no flicker).
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  if (prev !== value) {
    setDir(value > prev ? "up" : "down");
    setPrev(value);
  }
  const removes = value <= 1 && !!onRemove;
  const minDisabled = value <= 1 && !onRemove;
  const maxDisabled = value >= max;
  const h = size === "sm" ? "h-10" : size === "lg" ? "h-13" : "h-11";
  const cols = size === "lg" ? "grid-cols-[3.25rem_minmax(2.5rem,1fr)_3.25rem]" : size === "sm" ? "grid-cols-[2.5rem_minmax(2rem,1fr)_2.5rem]" : "grid-cols-[2.75rem_minmax(2.25rem,1fr)_2.75rem]";
  const btn =
    "sal-stepper-btn grid h-full touch-manipulation place-items-center text-brand-800 select-none hover:bg-brand-100 focus-visible:relative focus-visible:z-[1] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-600";
  return (
    <div role="group" aria-label={`${t.offer.quantity}: ${name}`} className={cn("sal-stepper grid overflow-hidden rounded-[var(--radius-md)] border border-brand-200 bg-brand-50", h, cols, className)}>
      <button
        type="button"
        className={cn(btn, "rounded-l-[calc(var(--radius-md)-1px)]")}
        aria-label={`${removes ? t.offer.removeFromCart : t.offer.decrease}: ${name}`}
        aria-disabled={minDisabled || undefined}
        onClick={() => {
          if (removes) onRemove!();
          else if (!minDisabled) onChange(value - 1);
        }}
      >
        <Icon name="minus" size={size === "sm" ? 18 : 20} />
      </button>
      <span className="grid min-w-0 place-items-center overflow-hidden text-center font-bold text-brand-800 tabular-nums">
        <span key={value} data-dir={dir ?? undefined} className={cn("sal-qty block", size === "lg" ? "text-lg" : "text-base")} aria-hidden="true">
          {value}
        </span>
        <span className="sr-only" role="status">
          {fmt(t.offer.inCartQty, { count: value })}
        </span>
      </span>
      <button
        type="button"
        className={cn(btn, "rounded-r-[calc(var(--radius-md)-1px)]")}
        aria-label={`${t.offer.increase}: ${name}`}
        data-stepper-plus=""
        aria-disabled={maxDisabled || undefined}
        title={maxDisabled ? fmt(t.offer.maxQty, { max }) : undefined}
        onClick={() => {
          if (!maxDisabled) onChange(value + 1);
        }}
      >
        <Icon name="plus" size={size === "sm" ? 18 : 20} />
      </button>
    </div>
  );
}

/**
 * Focus hand-over when a card action swaps between "Add to cart" and the stepper: after adding, focus moves to
 * "+" of the stepper; after removing with "−", back to the add button — but only when focus was inside the
 * control (keyboard and screen-reader users), never stealing it from elsewhere.
 */
export function useSwapFocus(inCart: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const target = box.current?.querySelector<HTMLElement>(inCart ? "[data-stepper-plus]" : "[data-cart-add]") ?? box.current?.querySelector<HTMLElement>("button");
    target?.focus({ preventScroll: true });
  }, [inCart]);
  const mark = () => {
    const active = document.activeElement;
    pending.current = !active || active === document.body || !!box.current?.contains(active);
  };
  return { box, mark };
}

/** `quiet`: no toast (the filled heart and aria-pressed confirm it) — used where a toast could cover the price. */
export function FavoriteButton({ variantId, className, quiet = false }: { variantId: string; className?: string; quiet?: boolean }) {
  const { t, href } = useSite();
  const toast = useToast();
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
        if (quiet) return;
        if (adding) toast(t.request.favoriteAdded, "success", { label: t.common.favorites, href: href("/favorites") });
        else toast(t.request.favoriteRemoved, "info");
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
 * "Add to cart" for a catalogue product (public.pharmacy_products). The catalogue has no confirmed price or stock
 * per pharmacy, so the line goes into the request "to be confirmed" (seenPriceKzt = null) and the pharmacy
 * confirms both by phone. Once added, the button turns into the "− 1 +" stepper; "−" at 1 removes the product
 * and the button comes back. The cart (localStorage) is the single source: cards, product page, header and cart
 * page all follow it, also across tabs.
 */
export function CatalogCartButton({ id, name, size = "md", className }: { id: string; name: string; size?: "md" | "lg"; className?: string }) {
  const { t, href, orderingEnabled } = useSite();
  const toast = useToast();
  const hydrated = useHydrated();
  const cart = useCart();
  const addedAt = useRef(0);
  const line = hydrated ? cart.find((l) => l.variantId === id) : undefined;
  const { box, mark } = useSwapFocus(!!line);
  if (!orderingEnabled) return null;
  // Long labels (Kazakh, English) wrap to a second line instead of being cut; the icon gives way on narrow cards.
  const cls = cn("w-full gap-1.5 px-2.5", size === "md" && "text-sm sm:text-[0.95rem]", className);
  return (
    <div ref={box}>
      {line ? (
        <CartStepper
          value={line.quantity}
          name={name}
          size={size}
          className={className}
          // The second tap of a quick double-tap lands on the stepper: it must not add a second unit.
          onChange={(n) => {
            if (Date.now() - addedAt.current > 400) cartStore.setQuantity(id, n);
          }}
          onRemove={() => {
            if (Date.now() - addedAt.current < 400) return;
            mark();
            cartStore.remove(id);
            toast(t.request.removed, "info");
          }}
        />
      ) : (
        <Button
          size={size}
          wrap
          data-cart-add=""
          className={cls}
          onClick={(e) => {
            // A quick second tap (before the button turns into the stepper) must not add a second unit.
            if (cartStore.get().some((l) => l.variantId === id)) return;
            mark();
            flyToCart(e.currentTarget);
            addedAt.current = Date.now();
            cartStore.add({ variantId: id, name, seenPriceKzt: null });
            toast(t.request.added, "success", { label: t.common.cart, href: href("/cart") });
          }}
        >
          <Icon name="cart" size={18} className="shrink-0 max-[399px]:hidden" />
          <span className="min-w-0 text-center">{t.offer.addToCart}</span>
        </Button>
      )}
    </div>
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
  const addedAt = useRef(0);
  const inCart = hydrated ? cart.find((l) => l.variantId === variantId) : undefined;
  const { box, mark } = useSwapFocus(!!inCart);
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
    const max = offer.action === "add" && offer.quantity !== null ? Math.max(1, Math.min(MAX_QTY, offer.quantity)) : MAX_QTY;
    return (
      <div ref={box} className={cn("flex items-center gap-2", full ? "flex-wrap" : "")}>
        <CartStepper
          value={inCart.quantity}
          max={Math.max(max, Math.min(MAX_QTY, inCart.quantity))}
          name={fullName}
          size={btnSize}
          className={full ? "w-full sm:w-44" : "w-full"}
          onChange={(n) => {
            if (Date.now() - addedAt.current > 400) cartStore.setQuantity(variantId, n);
          }}
          onRemove={() => {
            if (Date.now() - addedAt.current < 400) return;
            mark();
            cartStore.remove(variantId);
            toast(t.request.removed, "info");
          }}
        />
        {full ? (
          <Link
            href={href("/cart")}
            className={buttonClass("outline", btnSize, "w-full sm:w-auto")}
            onClick={(e) => {
              if (Date.now() - addedAt.current < 500) e.preventDefault();
            }}
          >
            {t.pdp.goToCart}
            <Icon name="chevronRight" size={18} />
          </Link>
        ) : null}
      </div>
    );
  }

  const add = (seenPrice: number | null, message: string, from: Element | null) => {
    // A quick second tap (before the button turns into "In cart") must not add the quantity twice.
    if (cartStore.get().some((l) => l.variantId === variantId)) return;
    mark();
    flyToCart(from);
    addedAt.current = Date.now();
    cartStore.add({ variantId, name: fullName, seenPriceKzt: seenPrice }, full ? qty : 1);
    toast(message, "success", { label: t.common.cart, href: href("/cart") });
  };

  if (offer.action === "add") {
    return (
      <div ref={box} className={cn("flex items-center gap-2", full ? "flex-wrap" : "")}>
        {full ? (
          <QuantitySelector value={qty} max={offer.quantity !== null ? Math.max(1, Math.min(10, offer.quantity)) : 10} onChange={setQty} labels={{ quantity: t.offer.quantity, decrease: t.offer.decrease, increase: t.offer.increase }} />
        ) : null}
        <Button size={btnSize} icon="cart" data-cart-add="" className={full ? "sm:min-w-52" : "w-full"} onClick={(e) => add(offer.priceKzt, t.offer.added, e.currentTarget)}>
          {t.offer.addToCart}
        </Button>
      </div>
    );
  }

  // "ask": price or stock unknown/stale — the item goes into the request and the operator confirms.
  return (
    <div ref={box}>
      <Button variant="outline" size={btnSize} icon="question" data-cart-add="" className={width} onClick={() => setAskOpen(true)}>
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
              onClick={(e) => {
                add(null, t.offer.askAdded, e.currentTarget);
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
    </div>
  );
}
