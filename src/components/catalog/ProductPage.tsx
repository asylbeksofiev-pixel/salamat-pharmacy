"use client";
// Interactive parts of the catalogue product page (/catalog/item/[id]): back link, photo gallery with zoom,
// article copy, the main "Add to cart" action with all its states, and the sticky action bar on phones.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/config";
import { cartStore, useCart, useHydrated } from "@/lib/client/stores";
import { flyToCart } from "@/lib/client/fly-to-cart";
import { useSite } from "../site/SiteProvider";
import { Button, buttonClass } from "../ui/Button";
import { Modal } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { Icon } from "../icons";
import { cn } from "../ui/cn";
import { CartStepper, MAX_QTY, useSwapFocus } from "./OfferActions";
import { PHOTO_FAILED_EVENT } from "./ProductPhoto";

/** "Back": returns to the previous page of this site (keeps search, filters, scroll), otherwise to the catalogue. */
export function BackLink({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        let sameSite = false;
        try {
          sameSite = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
        } catch {
          /* no referrer */
        }
        if (sameSite && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="-ml-2 inline-flex h-11 items-center gap-1 rounded-[var(--radius-md)] px-2 text-[0.95rem] font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink"
    >
      <Icon name="chevronLeft" size={20} />
      {label}
    </Link>
  );
}

/**
 * Photo area. The box is square and reserved before the image loads (no layout shift). Real photos open in a
 * zoom dialog (focus trapped, Escape and the close button close it, focus returns). Several photos — only when
 * several real images exist — scroll sideways with snap and show "1 / N" dots.
 */
export function ProductGallery({ photos, placeholder, name, overlay, caption }: { photos: ReactNode[]; placeholder: ReactNode; name: string; overlay?: ReactNode; caption?: ReactNode }) {
  const { t } = useSite();
  const [zoom, setZoom] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  // A photo whose link turns out to be dead is shown as the placeholder: no zoom, no photo credit then.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const on = () => setFailed(true);
    el.addEventListener(PHOTO_FAILED_EVENT, on);
    // Child effects run first: a photo that failed before hydration has already reported — check directly too.
    if (Array.from(el.querySelectorAll("img")).some((img) => img.complete && img.naturalWidth === 0)) on();
    return () => el.removeEventListener(PHOTO_FAILED_EVENT, on);
  }, []);
  const real = photos.length > 0 && !(failed && photos.length === 1);
  return (
    <div>
      <div className="relative">
        <div
          ref={track}
          className="sal-gallery flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[var(--radius-2xl)] border border-line bg-white"
          onScroll={(e) => {
            const el = e.currentTarget;
            setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
        >
          {photos.length && !failed ? (
            photos.map((photo, i) => (
              <div key={i} className="relative w-full shrink-0 snap-center">
                {photo}
                {/* Transparent button over the photo: opens the zoom dialog (the photo itself is not a link). */}
                <button
                  type="button"
                  onClick={() => setZoom(i)}
                  className="absolute inset-0 cursor-zoom-in rounded-[inherit] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-600"
                  aria-label={`${t.pdp.zoom}${photos.length > 1 ? `. ${fmt(t.pdp.photoOf, { n: i + 1, total: photos.length })}` : ""}`}
                />
              </div>
            ))
          ) : photos.length ? (
            <div className="w-full shrink-0">{photos[0]}</div>
          ) : (
            <div className="w-full shrink-0">{placeholder}</div>
          )}
        </div>
        {overlay ? <div className="absolute top-3 right-3 z-10">{overlay}</div> : null}
        {real ? (
          <span className="pointer-events-none absolute bottom-3 left-3 grid size-9 place-items-center rounded-full bg-white/90 text-ink-soft shadow-sm" aria-hidden="true">
            <Icon name="zoom" size={18} />
          </span>
        ) : null}
        {photos.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden="true">
            {photos.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", i === current ? "w-4 bg-brand-600" : "w-1.5 bg-ink/25")} />
            ))}
          </div>
        ) : null}
      </div>
      {real ? caption : null}
      {real ? (
        <Modal open={zoom !== null} onClose={() => setZoom(null)} title={name} closeLabel={t.common.close} className="w-[min(56rem,calc(100vw-1rem))]">
          <div className="relative mx-auto aspect-square w-full max-w-[min(48rem,calc(100dvh-10rem))]">{zoom !== null ? photos[zoom] : null}</div>
        </Modal>
      ) : null}
    </div>
  );
}

/**
 * Article number with a copy button. The confirmation appears right next to the button for two seconds
 * (aria-live), so it never covers the name or the price.
 */
export function ArticleCopy({ article, label }: { article: string; label: string }) {
  const { t } = useSite();
  const [copied, setCopied] = useState(0);
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), status === "ok" ? 2000 : 4000);
    return () => window.clearTimeout(timer);
  }, [status, copied]);
  return (
    <div className="min-w-0 text-sm text-muted">
      <div className="flex min-w-0 items-center gap-1">
        <span className="min-w-0">
          {label}: <span className="font-mono break-all text-ink-soft select-all">{article}</span>
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(article);
              setCopied((n) => n + 1);
              setStatus("ok");
            } catch {
              setStatus("fail");
            }
          }}
          aria-label={t.pdp.copyArticle}
          title={t.pdp.copyArticle}
          className="-my-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-brand-700 motion-safe:active:scale-90"
        >
          <span key={copied} className={cn("grid place-items-center", status === "ok" && "sal-cart-pop")}>
            <Icon name={status === "ok" ? "check" : "copy"} size={18} />
          </span>
        </button>
      </div>
      <span aria-live="polite" className={cn("sal-inline-note block text-xs font-semibold", status === "fail" ? "text-accent-700" : "text-brand-700")} data-shown={status !== "idle" || undefined}>
        {status === "ok" ? t.pdp.articleCopied : status === "fail" ? t.pdp.copyFailed : ""}
      </span>
    </div>
  );
}

const MAX_LINES = 30;

/**
 * Main action for a catalogue product. States: ready, pressed (CSS), added (flying dot, inline note or toast),
 * in cart ("− n +" stepper and a link to the cart), error (cart limit or storage failure), unavailable (requests
 * switched off on the site). There is no network request here, so there is no loading state.
 * A quick second tap never adds a second unit; the first tap after "added" cannot navigate away.
 */
export function PdpCartAction({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const { t, href, orderingEnabled } = useSite();
  const toast = useToast();
  const hydrated = useHydrated();
  const cart = useCart();
  const [error, setError] = useState<string | null>(null);
  const addedAt = useRef(0);
  const line = hydrated ? cart.find((l) => l.variantId === id) : undefined;
  const { box, mark } = useSwapFocus(!!line);
  const height = compact ? "md" : "lg";

  if (!orderingEnabled) {
    return (
      <Button size={height} className="w-full" disabled>
        {t.pdp.requestsUnavailable}
      </Button>
    );
  }
  if (line) {
    // In the cart: "− n +" (the "−" at 1 takes the product out and brings the button back) and the way to the cart.
    return (
      <div ref={box} className={cn("flex items-stretch gap-2", compact && "gap-1.5")}>
        <CartStepper
          value={line.quantity}
          max={MAX_QTY}
          name={name}
          size={height}
          className={compact ? "w-full" : "w-40 shrink-0 sm:w-44"}
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
        {compact ? null : (
          <Link
            href={href("/cart")}
            className={buttonClass("secondary", height, "min-w-0 flex-1 gap-1.5 px-3")}
            // The second tap of a quick double-tap lands here: it must not take the visitor away from the page.
            onClick={(e) => {
              if (Date.now() - addedAt.current < 500) e.preventDefault();
            }}
          >
            <span className="truncate">{t.pdp.goToCart}</span>
            <Icon name="chevronRight" size={18} className="-mr-1 shrink-0" />
          </Link>
        )}
      </div>
    );
  }
  return (
    <div ref={box}>
      <Button
        size={height}
        wrap={compact}
        data-cart-add=""
        className={cn("w-full gap-2 px-4", compact && "gap-1.5 px-3")}
        onClick={(e) => {
          if (cartStore.get().some((l) => l.variantId === id)) return;
          if (cartStore.get().length >= MAX_LINES) {
            setError(fmt(t.cart.tooManyItems, { max: MAX_LINES }));
            return;
          }
          mark();
          flyToCart(e.currentTarget);
          addedAt.current = Date.now();
          cartStore.add({ variantId: id, name, seenPriceKzt: null });
          if (!cartStore.get().some((l) => l.variantId === id)) {
            setError(t.pdp.addFailed);
            return;
          }
          setError(null);
          // From the sticky bar the page content is out of sight: a toast (placed above the bar) confirms it.
          // The main action confirms inline (see PdpAddedNote), so nothing covers the name, price or buttons.
          if (compact) toast(t.request.added, "success", { label: t.common.cart, href: href("/cart") });
        }}
      >
        <Icon name="cart" size={20} className={cn("shrink-0", compact && "max-[399px]:hidden")} />
        <span className={compact ? "min-w-0 text-center" : "truncate"}>{t.offer.addToCart}</span>
      </Button>
      {error ? (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-accent-700">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Phone-only action bar above the bottom navigation. It appears once the main action has scrolled out of view
 * (so the two never compete on one screen), hides while a text field is focused (on-screen keyboard), keeps
 * clear of the safe area and publishes its height as --sal-actionbar-h so toasts and the footer move above it.
 */
export function StickyActionBar({ targetId, children, label }: { targetId: string; children: ReactNode; label: string }) {
  const [shown, setShown] = useState(false);
  const [typing, setTyping] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(target);
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      setTyping(!!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
    };
    const onBlur = () => setTyping(false);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      io.disconnect();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, [targetId]);

  const visible = shown && !typing;
  useEffect(() => {
    const root = document.documentElement;
    if (visible && bar.current && window.matchMedia("(max-width: 47.99rem)").matches) root.style.setProperty("--sal-actionbar-h", `${bar.current.offsetHeight}px`);
    else root.style.removeProperty("--sal-actionbar-h");
    return () => {
      root.style.removeProperty("--sal-actionbar-h");
    };
  }, [visible]);

  return (
    <div
      ref={bar}
      role="region"
      aria-label={label}
      aria-hidden={!visible || undefined}
      inert={!visible}
      data-shown={visible || undefined}
      className="sal-actionbar fixed inset-x-0 z-30 border-t border-line bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_rgb(20_35_26/0.08)] backdrop-blur md:hidden"
    >
      {children}
    </div>
  );
}

/** Inline confirmation under the main action, shown once the product is in the cart (announced politely). */
export function PdpAddedNote({ id }: { id: string }) {
  const { t } = useSite();
  const hydrated = useHydrated();
  const cart = useCart();
  const inCart = hydrated && cart.some((l) => l.variantId === id);
  return (
    <p aria-live="polite" className="sal-inline-note flex items-start gap-1.5 text-sm font-medium text-brand-700" data-shown={inCart || undefined}>
      {inCart ? (
        <>
          <Icon name="checkCircle" size={18} className="mt-px shrink-0" />
          {t.request.added}
        </>
      ) : null}
    </p>
  );
}
