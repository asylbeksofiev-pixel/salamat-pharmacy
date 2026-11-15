"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { guarded, str } from "@/server/admin/guard";
import { done, fail } from "@/server/admin/action-state";
import { canAccessPharmacy } from "@/server/auth/permissions";
import { AccessDeniedError } from "@/server/auth/session";
import { canTransition, ORDER_STATUSES, ORDER_STATUS_LABELS_RU } from "@/lib/order-status";

async function loadScoped(user: Parameters<Parameters<typeof guarded>[1]>[0], orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Заявка не найдена");
  if (!canAccessPharmacy(user, "orders.write", order.pharmacyId)) throw new AccessDeniedError("Заявка другой аптеки");
  return order;
}

export const changeOrderStatus = guarded("orders.write", async (user, orderId: string, _prev: unknown, fd: FormData) => {
  const to = z.enum(ORDER_STATUSES).parse(str(fd, "status"));
  const note = str(fd, "note").slice(0, 500) || null;
  const order = await loadScoped(user, orderId);
  if (!canTransition(order.status, to)) return fail(`Переход «${ORDER_STATUS_LABELS_RU[order.status]}» → «${ORDER_STATUS_LABELS_RU[to]}» недоступен`);
  await prisma.$transaction(async (tx) => {
    // Optimistic check: the status must not have changed since the page was loaded.
    const res = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: to } });
    if (res.count === 0) throw new Error("Статус уже изменён другим сотрудником — обновите страницу");
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: to, adminUserId: user.id, note } });
    await audit(user.id, "order.status", "Order", order.id, `${order.publicId}: ${ORDER_STATUS_LABELS_RU[order.status]} → ${ORDER_STATUS_LABELS_RU[to]}`, { from: order.status, to }, tx);
  });
  revalidatePath(`/admin/orders/${order.id}`);
  return done(`Статус: ${ORDER_STATUS_LABELS_RU[to]}`);
});

export const addOrderNote = guarded("orders.write", async (user, orderId: string, _prev: unknown, fd: FormData) => {
  const body = str(fd, "body");
  if (!body) return fail("Введите текст заметки");
  if (body.length > 1000) return fail("Заметка длиннее 1000 символов");
  const order = await loadScoped(user, orderId);
  await prisma.orderNote.create({ data: { orderId: order.id, adminUserId: user.id, body } });
  await audit(user.id, "order.note", "Order", order.id, `${order.publicId}: служебная заметка`);
  revalidatePath(`/admin/orders/${order.id}`);
  return done("Заметка добавлена");
});
