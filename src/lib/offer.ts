// Business rules for showing a price and availability for one SKU in one pharmacy.
// Pure functions: used by server rendering, the cart quote API, order creation and tests.

export type StockStatusValue = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "ON_REQUEST" | "UNKNOWN";
export type PrescriptionValue = "PRESCRIPTION" | "NON_PRESCRIPTION" | "UNKNOWN";

export type RxPolicy = "BLOCK" | "PICKUP_WITH_PRESCRIPTION";
export type UnknownRxPolicy = "ALLOW_WITH_NOTICE" | "BLOCK";

export interface OfferPolicy {
  priceStaleHours: number;
  stockStaleHours: number;
  lowStockThreshold: number;
  rxPolicy: RxPolicy;
  unknownRxPolicy: UnknownRxPolicy;
}

export const DEFAULT_OFFER_POLICY: OfferPolicy = {
  priceStaleHours: 72,
  stockStaleHours: 24,
  lowStockThreshold: 3,
  rxPolicy: "BLOCK",
  unknownRxPolicy: "ALLOW_WITH_NOTICE",
};

export interface PriceInput {
  priceKzt: number;
  oldPriceKzt: number | null;
  sourceUpdatedAt: Date | string;
}
export interface InventoryInput {
  status: StockStatusValue;
  quantity: number | null;
  sourceUpdatedAt: Date | string;
}

export type PriceState = "confirmed" | "stale" | "unknown";
export type StockState = "in_stock" | "low" | "out" | "on_request" | "unknown" | "stale";
/**
 * add          — price and stock confirmed and fresh: normal "Add to cart", priced line;
 * ask          — something is unknown or stale: line goes into the request, operator confirms;
 * unavailable  — confirmed out of stock in this pharmacy;
 * rx_blocked   — prescription rules forbid an online request;
 * no_pharmacy  — no pharmacy selected yet.
 */
export type OfferAction = "add" | "ask" | "unavailable" | "rx_blocked" | "no_pharmacy";

export interface Offer {
  priceState: PriceState;
  /** Present for confirmed and stale prices; stale prices are shown only with a warning. */
  priceKzt: number | null;
  /** Only a real previous price, only next to a confirmed current price. */
  oldPriceKzt: number | null;
  priceUpdatedAt: string | null;
  stockState: StockState;
  quantity: number | null;
  stockUpdatedAt: string | null;
  action: OfferAction;
  rxNotice: "none" | "prescription_pickup" | "unknown";
}

const HOUR = 3600_000;

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

export function resolveStockState(
  inv: InventoryInput | null | undefined,
  policy: OfferPolicy,
  now: Date,
): StockState {
  if (!inv) return "unknown";
  const age = now.getTime() - toDate(inv.sourceUpdatedAt).getTime();
  if (inv.status === "UNKNOWN") return "unknown";
  if (age > policy.stockStaleHours * HOUR) return "stale";
  if (inv.status === "OUT_OF_STOCK") return "out";
  if (inv.status === "ON_REQUEST") return "on_request";
  if (inv.quantity !== null && inv.quantity !== undefined) {
    if (inv.quantity <= 0) return "out";
    if (inv.quantity <= policy.lowStockThreshold) return "low";
  }
  return inv.status === "LOW_STOCK" ? "low" : "in_stock";
}

export function resolvePriceState(price: PriceInput | null | undefined, policy: OfferPolicy, now: Date): PriceState {
  if (!price || !Number.isInteger(price.priceKzt) || price.priceKzt <= 0) return "unknown";
  const age = now.getTime() - toDate(price.sourceUpdatedAt).getTime();
  return age > policy.priceStaleHours * HOUR ? "stale" : "confirmed";
}

export function computeOffer(args: {
  hasPharmacy: boolean;
  price?: PriceInput | null;
  inventory?: InventoryInput | null;
  prescriptionStatus: PrescriptionValue;
  policy?: OfferPolicy;
  now?: Date;
}): Offer {
  const policy = args.policy ?? DEFAULT_OFFER_POLICY;
  const now = args.now ?? new Date();
  const priceState = args.hasPharmacy ? resolvePriceState(args.price, policy, now) : "unknown";
  const stockState = args.hasPharmacy ? resolveStockState(args.inventory, policy, now) : "unknown";

  let rxNotice: Offer["rxNotice"] = "none";
  let rxBlocked = false;
  if (args.prescriptionStatus === "PRESCRIPTION") {
    if (policy.rxPolicy === "BLOCK") rxBlocked = true;
    else rxNotice = "prescription_pickup";
  } else if (args.prescriptionStatus === "UNKNOWN") {
    if (policy.unknownRxPolicy === "BLOCK") rxBlocked = true;
    else rxNotice = "unknown";
  }

  let action: OfferAction;
  if (!args.hasPharmacy) action = "no_pharmacy";
  else if (rxBlocked) action = "rx_blocked";
  else if (stockState === "out") action = "unavailable";
  else if (priceState === "confirmed" && (stockState === "in_stock" || stockState === "low")) action = "add";
  else action = "ask";

  const showPrice = priceState === "confirmed" || priceState === "stale";
  const oldPrice =
    priceState === "confirmed" && args.price?.oldPriceKzt && args.price.oldPriceKzt > args.price.priceKzt
      ? args.price.oldPriceKzt
      : null;

  return {
    priceState,
    priceKzt: showPrice && args.price ? args.price.priceKzt : null,
    oldPriceKzt: oldPrice,
    priceUpdatedAt: showPrice && args.price ? toDate(args.price.sourceUpdatedAt).toISOString() : null,
    stockState,
    quantity: stockState === "unknown" ? null : (args.inventory?.quantity ?? null),
    stockUpdatedAt: args.inventory && args.hasPharmacy ? toDate(args.inventory.sourceUpdatedAt).toISOString() : null,
    action,
    rxNotice,
  };
}

/** A pharmacy counts as "has it" for the product page list only with fresh, confirmed stock. */
export function isConfirmedAvailable(inv: InventoryInput | null | undefined, policy: OfferPolicy, now = new Date()) {
  const s = resolveStockState(inv, policy, now);
  return s === "in_stock" || s === "low";
}
