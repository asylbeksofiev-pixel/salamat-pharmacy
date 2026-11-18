import { z } from "zod";
import { locales } from "./i18n/config";

export const cartItemSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: z.number().int().min(1).max(99),
  /** Price the visitor saw when adding (null = "to be confirmed"). Used to detect changes. */
  seenPriceKzt: z.number().int().positive().nullable().optional(),
});

export const quoteRequestSchema = z.object({
  pharmacyId: z.string().min(1).max(40).nullable(),
  items: z.array(cartItemSchema).max(100),
});

export const orderRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  pharmacyId: z.string().min(1, "pharmacyRequired").max(40),
  fulfillment: z.enum(["PICKUP", "DELIVERY"]),
  name: z.string().trim().min(1, "nameRequired").max(80, "nameTooLong"),
  phone: z.string().trim().min(1, "phoneRequired").max(40, "phoneInvalid"),
  comment: z.string().trim().max(500, "commentTooLong").optional().default(""),
  deliveryAddress: z.string().trim().max(300).optional().default(""),
  consent: z.literal(true, { error: "consentRequired" }),
  locale: z.enum(locales).default("ru"),
  items: z.array(cartItemSchema).min(1, "cartEmpty").max(100),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type OrderRequest = z.infer<typeof orderRequestSchema>;
