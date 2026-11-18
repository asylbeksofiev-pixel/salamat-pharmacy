import "server-only";
import { prisma } from "../db";
import { env } from "../env";
import { getSettings, type Settings } from "../settings";
import { computeOffer, type Offer } from "@/lib/offer";
import type { CartItemInput } from "@/lib/order-schema";
import { pickLocalized, type Locale } from "@/lib/i18n";
import { isCatalogId, listCatalogItemsByIds } from "../catalog-items";

export type LineIssue = "price_changed" | "became_unavailable" | "rx_blocked" | "removed" | "qty_limited" | "needs_confirmation";

export interface QuoteLine {
  variantId: string;
  /**
   * "catalog" — a product from public.pharmacy_products (id is its numeric id). Such products have no
   * confirmed per-pharmacy price or stock yet, so the line always goes to the pharmacy "to be confirmed".
   */
  kind: "variant" | "catalog";
  fullName: string;
  /** SALAMAT article of a catalogue product (never an internal id). */
  article: string | null;
  productSlug: string | null;
  variantSlug: string | null;
  imageUrl: string | null;
  prescriptionStatus: "PRESCRIPTION" | "NON_PRESCRIPTION" | "UNKNOWN";
  quantity: number;
  offer: Offer | null;
  /** Confirmed unit price used for the total; null when the operator must confirm. */
  unitPriceKzt: number | null;
  lineTotalKzt: number | null;
  issues: LineIssue[];
  previousPriceKzt: number | null;
  /** Line cannot be submitted (removed, unavailable, prescription rules). */
  blocking: boolean;
}

export interface Quote {
  pharmacy: { id: string; slug: string; address: string; acceptsOrders: boolean } | null;
  lines: QuoteLine[];
  totalKzt: number;
  hasUnpriced: boolean;
  hasBlocking: boolean;
  hasChanges: boolean;
  limits: { maxLines: number; maxQtyPerLine: number };
  deliveryEnabled: boolean;
}

export async function buildQuote(args: {
  pharmacyId: string | null;
  items: CartItemInput[];
  locale: Locale;
  settings?: Settings;
  now?: Date;
}): Promise<Quote> {
  const settings = args.settings ?? (await getSettings());
  const policy = settings.offerPolicy;
  const now = args.now ?? new Date();
  const { maxLines, maxQtyPerLine } = settings.checkout;

  // Merge duplicates and cap the number of lines.
  const merged = new Map<string, CartItemInput>();
  for (const it of args.items) {
    const prev = merged.get(it.variantId);
    merged.set(it.variantId, prev ? { ...prev, quantity: prev.quantity + it.quantity } : { ...it });
  }
  const items = [...merged.values()].slice(0, maxLines);
  // Numeric ids are catalogue products (public.pharmacy_products); SKU-level variants have cuid ids.
  const catalogIds = items.filter((i) => isCatalogId(i.variantId)).map((i) => i.variantId);
  const variantIds = items.filter((i) => !isCatalogId(i.variantId)).map((i) => i.variantId);

  const pharmacy = args.pharmacyId
    ? await prisma.pharmacy.findFirst({ where: { id: args.pharmacyId, isActive: true } })
    : null;

  const catalogItems = catalogIds.length ? await listCatalogItemsByIds(catalogIds) : [];
  const catalogById = new Map(catalogItems.map((c) => [c.id, c]));
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: { select: { slug: true, publicationStatus: true } },
      source: { select: { isDemo: true } },
      prices: pharmacy ? { where: { pharmacyId: pharmacy.id } } : false,
      inventories: pharmacy ? { where: { pharmacyId: pharmacy.id } } : false,
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: QuoteLine[] = items.map((it) => {
    if (isCatalogId(it.variantId)) return catalogLine(it, catalogById.get(it.variantId) ?? null, { maxQtyPerLine, policy, hasPharmacy: !!pharmacy });
    const v = byId.get(it.variantId);
    const visible =
      v && v.isActive && v.product.publicationStatus === "PUBLISHED" && (!v.source?.isDemo || env.showDemoData);
    if (!v || !visible) {
      return {
        variantId: it.variantId,
        kind: "variant",
        fullName: v?.fullName ?? "—",
        article: null,
        productSlug: null,
        variantSlug: null,
        imageUrl: null,
        prescriptionStatus: "UNKNOWN",
        quantity: Math.min(it.quantity, maxQtyPerLine),
        offer: null,
        unitPriceKzt: null,
        lineTotalKzt: null,
        issues: ["removed"],
        previousPriceKzt: it.seenPriceKzt ?? null,
        blocking: true,
      };
    }
    const price = pharmacy && Array.isArray(v.prices) ? v.prices[0] : undefined;
    const inv = pharmacy && Array.isArray(v.inventories) ? v.inventories[0] : undefined;
    const offer = computeOffer({
      hasPharmacy: !!pharmacy,
      price: price ? { priceKzt: price.priceKzt, oldPriceKzt: price.oldPriceKzt, sourceUpdatedAt: price.sourceUpdatedAt } : null,
      inventory: inv ? { status: inv.status, quantity: inv.quantity, sourceUpdatedAt: inv.sourceUpdatedAt } : null,
      prescriptionStatus: v.prescriptionStatus,
      policy,
      now,
    });
    const issues: LineIssue[] = [];
    let quantity = it.quantity;
    if (quantity > maxQtyPerLine) {
      quantity = maxQtyPerLine;
      issues.push("qty_limited");
    }
    let blocking = false;
    if (offer.action === "rx_blocked") {
      issues.push("rx_blocked");
      blocking = true;
    } else if (offer.action === "unavailable") {
      issues.push("became_unavailable");
      blocking = true;
    }
    let unitPriceKzt: number | null = null;
    if (offer.action === "add" && offer.priceKzt !== null) {
      // Not more than confirmed stock: the excess goes to the operator as "needs confirmation".
      if (offer.quantity !== null && quantity > offer.quantity) issues.push("needs_confirmation");
      else unitPriceKzt = offer.priceKzt;
    } else if (offer.action === "ask") {
      issues.push("needs_confirmation");
    }
    const seen = it.seenPriceKzt ?? null;
    if (pharmacy && seen !== null && unitPriceKzt !== null && seen !== unitPriceKzt) issues.push("price_changed");
    if (pharmacy && seen !== null && unitPriceKzt === null && !blocking) issues.push("price_changed");
    return {
      variantId: v.id,
      kind: "variant",
      fullName: v.fullName,
      article: null,
      productSlug: v.product.slug,
      variantSlug: v.slug,
      imageUrl: v.imageUrl,
      prescriptionStatus: v.prescriptionStatus,
      quantity,
      offer,
      unitPriceKzt,
      lineTotalKzt: unitPriceKzt !== null ? unitPriceKzt * quantity : null,
      issues,
      previousPriceKzt: seen,
      blocking,
    };
  });

  return {
    pharmacy: pharmacy
      ? { id: pharmacy.id, slug: pharmacy.slug, address: pickLocalized(args.locale, pharmacy.addressRu, pharmacy.addressKk), acceptsOrders: pharmacy.acceptsOrders }
      : null,
    lines,
    totalKzt: lines.reduce((s, l) => s + (l.blocking ? 0 : (l.lineTotalKzt ?? 0)), 0),
    hasUnpriced: lines.some((l) => !l.blocking && l.unitPriceKzt === null),
    hasBlocking: lines.some((l) => l.blocking),
    hasChanges: lines.some((l) => l.issues.includes("price_changed") || l.issues.includes("removed") || l.issues.includes("became_unavailable") || l.issues.includes("qty_limited")),
    limits: { maxLines, maxQtyPerLine },
    deliveryEnabled: settings.checkout.deliveryEnabled,
  };
}

/**
 * A catalogue product in the cart. The catalogue has no per-pharmacy prices or stock, so the line is never
 * priced here (even if the table gets a general price column): the pharmacy confirms price and stock by phone.
 */
function catalogLine(
  it: CartItemInput,
  item: { id: string; name: string; article: string | null; imageUrl: string | null } | null,
  ctx: { maxQtyPerLine: number; policy: Settings["offerPolicy"]; hasPharmacy: boolean },
): QuoteLine {
  const quantity = Math.min(it.quantity, ctx.maxQtyPerLine);
  const issues: LineIssue[] = it.quantity > ctx.maxQtyPerLine ? ["qty_limited"] : [];
  if (!item) {
    return { variantId: it.variantId, kind: "catalog", fullName: "—", article: null, productSlug: null, variantSlug: null, imageUrl: null, prescriptionStatus: "UNKNOWN", quantity, offer: null, unitPriceKzt: null, lineTotalKzt: null, issues: [...issues, "removed"], previousPriceKzt: it.seenPriceKzt ?? null, blocking: true };
  }
  // Prescription status is unknown for catalogue products: follow the same policy as for SKUs.
  const rxBlocked = ctx.policy.unknownRxPolicy === "BLOCK";
  issues.push(rxBlocked ? "rx_blocked" : "needs_confirmation");
  const seen = it.seenPriceKzt ?? null;
  // A price seen earlier can no longer be honoured: the visitor must see that it is now "to be confirmed".
  if (ctx.hasPharmacy && seen !== null && !rxBlocked) issues.push("price_changed");
  return {
    variantId: item.id,
    kind: "catalog",
    fullName: item.name,
    article: item.article,
    productSlug: null,
    variantSlug: null,
    imageUrl: item.imageUrl,
    prescriptionStatus: "UNKNOWN",
    quantity,
    offer: null,
    unitPriceKzt: null,
    lineTotalKzt: null,
    issues,
    previousPriceKzt: seen,
    blocking: rxBlocked,
  };
}
