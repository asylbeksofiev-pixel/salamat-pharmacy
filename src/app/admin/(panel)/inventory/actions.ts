"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { guarded, optInt, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { canAccessPharmacy } from "@/server/auth/permissions";
import { AccessDeniedError } from "@/server/auth/session";

/** Manual price/stock confirmation by a branch manager: stamped with the current time and the "manual" source. */
export const saveOffer = guarded("prices.write", async (user, variantId: string, pharmacyId: string, _prev: unknown, fd: FormData) => {
  if (!canAccessPharmacy(user, "prices.write", pharmacyId)) throw new AccessDeniedError("Нет доступа к ценам этого филиала");
  const price = optInt(fd, "price");
  const oldPrice = optInt(fd, "oldPrice");
  const qty = optInt(fd, "qty");
  const status = z.enum(["", "IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"]).parse(str(fd, "status"));
  if (price !== null && (price <= 0 || price > 10_000_000)) return fail("Цена должна быть больше 0");
  if (oldPrice !== null && (price === null || oldPrice <= price)) return fail("Прежняя цена указывается только если она выше текущей");
  if (qty !== null && qty < 0) return fail("Остаток не может быть отрицательным");
  const [variant, pharmacy, manual] = await Promise.all([
    prisma.productVariant.findUnique({ where: { id: variantId }, select: { fullName: true } }),
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { code: true } }),
    prisma.dataSource.findUnique({ where: { code: "manual" } }),
  ]);
  if (!variant || !pharmacy) return fail("Не найдено");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (price === null) await tx.price.deleteMany({ where: { variantId, pharmacyId } });
    else
      await tx.price.upsert({
        where: { variantId_pharmacyId: { variantId, pharmacyId } },
        create: { variantId, pharmacyId, priceKzt: price, oldPriceKzt: oldPrice, sourceId: manual?.id, sourceUpdatedAt: now },
        update: { priceKzt: price, oldPriceKzt: oldPrice, sourceId: manual?.id, sourceUpdatedAt: now },
      });
    const finalStatus = status || (qty === null ? "" : qty > 0 ? "IN_STOCK" : "OUT_OF_STOCK");
    if (!finalStatus) await tx.inventory.deleteMany({ where: { variantId, pharmacyId } });
    else
      await tx.inventory.upsert({
        where: { variantId_pharmacyId: { variantId, pharmacyId } },
        create: { variantId, pharmacyId, status: finalStatus, quantity: qty, sourceId: manual?.id, sourceUpdatedAt: now },
        update: { status: finalStatus, quantity: qty, sourceId: manual?.id, sourceUpdatedAt: now },
      });
    await audit(user.id, "offer.update", "Price", `${variantId}:${pharmacyId}`, `${pharmacy.code} · ${variant.fullName}: цена ${price ?? "—"}, остаток ${qty ?? "—"} ${finalStatus || "неизвестен"}`, { price, oldPrice, qty, status: finalStatus || null }, tx);
  });
  revalidatePath("/admin/inventory");
  return done("Подтверждено");
});
