import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettings } from "../settings";
import { rateLimit } from "../rate-limit";
import { buildQuote, type Quote } from "./quote";
import { normalizeKzPhone } from "@/lib/phone";
import { orderRequestSchema } from "@/lib/order-schema";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

export function generatePublicId(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `S-${s.slice(0, 4)}-${s.slice(4)}`;
}

export type CreateOrderResult =
  | { ok: true; publicId: string; orderId: string; duplicate: boolean }
  | { ok: false; status: 400; errors: Record<string, string> }
  | { ok: false; status: 409; code: "changed" | "pharmacy_not_accepting" | "blocked_items" | "delivery_disabled"; quote?: Quote }
  | { ok: false; status: 429; code: "rate_limited" };

export async function createOrder(raw: unknown, clientHash: string): Promise<CreateOrderResult> {
  const parsed = orderRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (!errors[field]) errors[field] = issue.message.length < 40 ? issue.message : "invalid";
    }
    return { ok: false, status: 400, errors };
  }
  const input = parsed.data;
  const phone = normalizeKzPhone(input.phone);
  if (!phone) return { ok: false, status: 400, errors: { phone: "phoneInvalid" } };

  // Idempotency: the same checkout attempt returns the same order.
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, publicId: true } });
  if (existing) return { ok: true, publicId: existing.publicId, orderId: existing.id, duplicate: true };

  const [shortOk, dayOk] = await Promise.all([
    rateLimit(`order:10m:${clientHash}`, 5, 600),
    rateLimit(`order:1d:${clientHash}`, 20, 86400),
  ]);
  if (!shortOk || !dayOk) return { ok: false, status: 429, code: "rate_limited" };

  const settings = await getSettings();
  if (input.fulfillment === "DELIVERY") {
    if (!settings.checkout.deliveryEnabled) return { ok: false, status: 409, code: "delivery_disabled" };
    if (!input.deliveryAddress) return { ok: false, status: 400, errors: { deliveryAddress: "addressRequired" } };
  }
  if (input.items.length > settings.checkout.maxLines) return { ok: false, status: 400, errors: { items: "tooManyItems" } };

  // Re-check prices and availability right before saving.
  const quote = await buildQuote({ pharmacyId: input.pharmacyId, items: input.items, locale: input.locale, settings });
  if (!quote.pharmacy) return { ok: false, status: 400, errors: { pharmacyId: "pharmacyRequired" } };
  if (!quote.pharmacy.acceptsOrders) return { ok: false, status: 409, code: "pharmacy_not_accepting", quote };
  if (quote.hasBlocking) return { ok: false, status: 409, code: "blocked_items", quote };
  if (quote.hasChanges) return { ok: false, status: 409, code: "changed", quote };

  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = generatePublicId();
    try {
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            publicId,
            idempotencyKey: input.idempotencyKey,
            customerName: input.name,
            customerPhone: phone,
            customerComment: input.comment || null,
            deliveryAddress: input.fulfillment === "DELIVERY" ? input.deliveryAddress : null,
            pharmacyId: quote.pharmacy!.id,
            fulfillment: input.fulfillment,
            locale: input.locale,
            totalKzt: quote.lines.some((l) => l.unitPriceKzt !== null) ? quote.totalKzt : null,
            hasUnpricedItems: quote.hasUnpriced,
            consentAt: new Date(),
            consentVersion: settings.checkout.consentVersion,
            clientIpHash: clientHash,
            items: {
              create: quote.lines.map((l) => ({
                // Catalogue products are not ProductVariant rows: keep the name and SALAMAT article as the snapshot.
                variantId: l.kind === "variant" ? l.variantId : null,
                nameSnapshot: l.fullName,
                skuSnapshot: l.kind === "variant" ? l.variantSlug : (l.article ?? `#${l.variantId}`),
                quantity: l.quantity,
                unitPriceKzt: l.unitPriceKzt,
                lineTotalKzt: l.lineTotalKzt,
                priceUpdatedAt: l.unitPriceKzt !== null && l.offer?.priceUpdatedAt ? new Date(l.offer.priceUpdatedAt) : null,
                stockStatusSnapshot:
                  l.offer?.stockState === "in_stock"
                    ? "IN_STOCK"
                    : l.offer?.stockState === "low"
                      ? "LOW_STOCK"
                      : l.offer?.stockState === "on_request"
                        ? "ON_REQUEST"
                        : "UNKNOWN",
                prescriptionSnapshot: l.prescriptionStatus,
              })),
            },
            events: { create: { toStatus: "NEW", note: "Заявка с сайта" } },
          },
          select: { id: true, publicId: true },
        });
        return created;
      });
      return { ok: true, publicId: order.publicId, orderId: order.id, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String((e.meta as { target?: unknown })?.target ?? "");
        if (target.includes("idempotencyKey")) {
          const again = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, publicId: true } });
          if (again) return { ok: true, publicId: again.publicId, orderId: again.id, duplicate: true };
        }
        continue; // publicId collision: try another
      }
      throw e;
    }
  }
  throw new Error("Could not allocate an order number");
}
