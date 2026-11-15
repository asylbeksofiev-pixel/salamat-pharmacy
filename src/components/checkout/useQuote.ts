"use client";
import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/server/orders/quote";
import { cartStore, useCart, useHydrated, type CartLine } from "@/lib/client/stores";

export interface ChangeNote {
  kind: "price" | "unavailable" | "removed" | "rx";
  oldPrice?: number | null;
  newPrice?: number | null;
}

/**
 * Asks the server to recalculate the cart for the selected pharmacy. Price/availability changes are kept as
 * notes so the visitor sees them, and the new prices become the baseline for submitting the request.
 */
export function useQuote(pharmacyId: string | null, locale: string) {
  const hydrated = useHydrated();
  const lines = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [notes, setNotes] = useState<Record<string, ChangeNote>>({});
  const [nonce, setNonce] = useState(0);
  const key = lines.map((l) => `${l.variantId}:${l.quantity}:${l.seenPriceKzt ?? "n"}`).join("|");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hydrated || !lines.length) return;
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pharmacyId, locale, items: lines.map((l: CartLine) => ({ variantId: l.variantId, quantity: l.quantity, seenPriceKzt: l.seenPriceKzt })) }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const q = (await res.json()) as Quote;
        setQuote(q);
        applyQuoteNotes(q);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures the relevant cart state
  }, [key, pharmacyId, hydrated, locale, nonce]);

  function applyQuoteNotes(q: Quote) {
    const fresh: Record<string, ChangeNote> = {};
    const accept: Record<string, number | null> = {};
    for (const l of q.lines) {
      if (l.issues.includes("removed")) fresh[l.variantId] = { kind: "removed" };
      else if (l.issues.includes("rx_blocked")) fresh[l.variantId] = { kind: "rx" };
      else if (l.issues.includes("became_unavailable")) fresh[l.variantId] = { kind: "unavailable" };
      else if (l.issues.includes("price_changed")) {
        fresh[l.variantId] = { kind: "price", oldPrice: l.previousPriceKzt, newPrice: l.unitPriceKzt };
        accept[l.variantId] = l.unitPriceKzt;
      }
      // Lines added as "to be confirmed" that now have a confirmed price: adopt it silently as the baseline.
      if (q.pharmacy && l.previousPriceKzt === null && l.unitPriceKzt !== null) accept[l.variantId] = l.unitPriceKzt;
      if (l.issues.includes("qty_limited")) cartStore.setQuantity(l.variantId, l.quantity);
    }
    if (Object.keys(fresh).length) setNotes((n) => ({ ...n, ...fresh }));
    if (Object.keys(accept).length) cartStore.acceptPrices(accept);
  }

  return { lines, quote: lines.length ? quote : null, loading, error, notes, hydrated, refresh: () => setNonce((n) => n + 1), applyQuoteNotes, setQuote };
}
