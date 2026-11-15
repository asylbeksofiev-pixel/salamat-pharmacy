import { describe, expect, it } from "vitest";
import { computeOffer, DEFAULT_OFFER_POLICY, resolveStockState, type OfferPolicy } from "@/lib/offer";

const now = new Date("2026-11-14T12:00:00Z");
const fresh = new Date("2026-11-14T10:00:00Z");
const old = new Date("2026-11-01T10:00:00Z");

describe("computeOffer", () => {
  it("never turns a missing price into 0 ₸", () => {
    const o = computeOffer({ hasPharmacy: true, price: null, inventory: { status: "IN_STOCK", quantity: 5, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.priceKzt).toBeNull();
    expect(o.priceState).toBe("unknown");
    expect(o.action).toBe("ask");
  });

  it("treats a zero or negative price as unknown", () => {
    const o = computeOffer({ hasPharmacy: true, price: { priceKzt: 0, oldPriceKzt: null, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.priceKzt).toBeNull();
  });

  it("does not report unknown stock as in stock", () => {
    const o = computeOffer({ hasPharmacy: true, price: { priceKzt: 450, oldPriceKzt: null, sourceUpdatedAt: fresh }, inventory: null, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.stockState).toBe("unknown");
    expect(o.action).toBe("ask");
  });

  it("allows add-to-cart only with fresh confirmed price and stock", () => {
    const o = computeOffer({ hasPharmacy: true, price: { priceKzt: 450, oldPriceKzt: null, sourceUpdatedAt: fresh }, inventory: { status: "IN_STOCK", quantity: 25, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.action).toBe("add");
    expect(o.priceKzt).toBe(450);
    expect(o.stockState).toBe("in_stock");
  });

  it("marks stale price and stale stock and asks the operator", () => {
    const o = computeOffer({ hasPharmacy: true, price: { priceKzt: 450, oldPriceKzt: 500, sourceUpdatedAt: old }, inventory: { status: "IN_STOCK", quantity: 25, sourceUpdatedAt: old }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.priceState).toBe("stale");
    expect(o.stockState).toBe("stale");
    expect(o.oldPriceKzt).toBeNull(); // no "discount" next to a stale price
    expect(o.action).toBe("ask");
  });

  it("derives low stock and out of stock from quantity", () => {
    expect(resolveStockState({ status: "IN_STOCK", quantity: 2, sourceUpdatedAt: fresh }, DEFAULT_OFFER_POLICY, now)).toBe("low");
    expect(resolveStockState({ status: "IN_STOCK", quantity: 0, sourceUpdatedAt: fresh }, DEFAULT_OFFER_POLICY, now)).toBe("out");
    const o = computeOffer({ hasPharmacy: true, price: { priceKzt: 790, oldPriceKzt: null, sourceUpdatedAt: fresh }, inventory: { status: "OUT_OF_STOCK", quantity: 0, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.action).toBe("unavailable");
  });

  it("shows an old price only when it is a real higher price", () => {
    const o = computeOffer({ hasPharmacy: true, price: { priceKzt: 1890, oldPriceKzt: 2100, sourceUpdatedAt: fresh }, inventory: { status: "IN_STOCK", quantity: 10, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.oldPriceKzt).toBe(2100);
    const p = computeOffer({ hasPharmacy: true, price: { priceKzt: 1890, oldPriceKzt: 1500, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(p.oldPriceKzt).toBeNull();
  });

  it("requires a pharmacy before showing a price", () => {
    const o = computeOffer({ hasPharmacy: false, price: { priceKzt: 450, oldPriceKzt: null, sourceUpdatedAt: fresh }, prescriptionStatus: "NON_PRESCRIPTION", now });
    expect(o.action).toBe("no_pharmacy");
    expect(o.priceKzt).toBeNull();
  });

  it("applies prescription policies", () => {
    const base = { hasPharmacy: true, price: { priceKzt: 1450, oldPriceKzt: null, sourceUpdatedAt: fresh }, inventory: { status: "IN_STOCK" as const, quantity: 9, sourceUpdatedAt: fresh }, now };
    expect(computeOffer({ ...base, prescriptionStatus: "PRESCRIPTION" }).action).toBe("rx_blocked");
    const pickup: OfferPolicy = { ...DEFAULT_OFFER_POLICY, rxPolicy: "PICKUP_WITH_PRESCRIPTION" };
    const o = computeOffer({ ...base, prescriptionStatus: "PRESCRIPTION", policy: pickup });
    expect(o.action).toBe("add");
    expect(o.rxNotice).toBe("prescription_pickup");
    expect(computeOffer({ ...base, prescriptionStatus: "UNKNOWN" }).rxNotice).toBe("unknown");
    expect(computeOffer({ ...base, prescriptionStatus: "UNKNOWN", policy: { ...DEFAULT_OFFER_POLICY, unknownRxPolicy: "BLOCK" } }).action).toBe("rx_blocked");
  });
});
