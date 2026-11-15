"use client";
// Cart and favourites live in the visitor's browser (localStorage) — no account needed.
// Prices are never trusted from here: the server recalculates everything (/api/cart/quote, /api/orders).
import { useSyncExternalStore } from "react";

export interface CartLine {
  variantId: string;
  quantity: number;
  /** Price shown when the item was added (null = "to be confirmed"); used to detect changes. */
  seenPriceKzt: number | null;
  name: string;
  addedAt: number;
}

function createStore<T>(key: string, validate: (v: unknown) => T, empty: T) {
  let cache: T | null = null;
  const listeners = new Set<() => void>();
  const read = (): T => {
    if (cache !== null) return cache;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? validate(JSON.parse(raw)) : empty;
    } catch {
      cache = empty;
    }
    return cache;
  };
  const write = (value: T) => {
    cache = value;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: keep in memory */
    }
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = null;
        listeners.forEach((x) => x());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  };
  return { read, write, subscribe, empty };
}

const EMPTY_CART: CartLine[] = [];
const cart = createStore<CartLine[]>(
  "salamat_cart_v1",
  (v) =>
    Array.isArray(v)
      ? v
          .filter((l) => l && typeof l.variantId === "string" && Number.isInteger(l.quantity) && l.quantity > 0)
          .slice(0, 50)
          .map((l) => ({
            variantId: String(l.variantId).slice(0, 40),
            quantity: Math.min(99, l.quantity),
            seenPriceKzt: typeof l.seenPriceKzt === "number" ? l.seenPriceKzt : null,
            name: String(l.name ?? "").slice(0, 300),
            addedAt: Number(l.addedAt) || Date.now(),
          }))
      : EMPTY_CART,
  EMPTY_CART,
);

export const cartStore = {
  subscribe: cart.subscribe,
  get: cart.read,
  add(item: Omit<CartLine, "addedAt" | "quantity">, quantity = 1, max = 10) {
    const lines = cart.read();
    const existing = lines.find((l) => l.variantId === item.variantId);
    if (existing) {
      cart.write(lines.map((l) => (l.variantId === item.variantId ? { ...l, quantity: Math.min(max, l.quantity + quantity), seenPriceKzt: item.seenPriceKzt } : l)));
    } else {
      cart.write([...lines, { ...item, quantity: Math.min(max, quantity), addedAt: Date.now() }]);
    }
  },
  setQuantity(variantId: string, quantity: number) {
    cart.write(cart.read().map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(99, quantity)) } : l)));
  },
  remove(variantId: string) {
    cart.write(cart.read().filter((l) => l.variantId !== variantId));
  },
  clear() {
    cart.write([]);
  },
  /** After the visitor has seen a recalculated price, remember it as the new baseline. */
  acceptPrices(prices: Record<string, number | null>) {
    cart.write(cart.read().map((l) => (l.variantId in prices ? { ...l, seenPriceKzt: prices[l.variantId] } : l)));
  },
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(cart.subscribe, cart.read, () => EMPTY_CART);
}

export function useCartCount(): number {
  const lines = useCart();
  return lines.length;
}

const EMPTY_FAV: string[] = [];
const fav = createStore<string[]>(
  "salamat_favorites_v1",
  (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 100) : EMPTY_FAV),
  EMPTY_FAV,
);

export const favoritesStore = {
  toggle(variantId: string): boolean {
    const list = fav.read();
    const on = !list.includes(variantId);
    fav.write(on ? [variantId, ...list].slice(0, 100) : list.filter((x) => x !== variantId));
    return on;
  },
};

export function useFavorites(): string[] {
  return useSyncExternalStore(fav.subscribe, fav.read, () => EMPTY_FAV);
}

/** Hydration-safe flag: false on the server and during the first client render. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
