import "server-only";
import { prisma } from "./db";
import { getSettings } from "./settings";

/**
 * Removes customer contact data from completed/cancelled requests older than the retention period,
 * and cleans technical tables (rate limits, expired sessions). Contains no personal data in the result.
 */
export async function runRetention(): Promise<{ anonymized: number; days: number }> {
  const settings = await getSettings();
  const days = settings.retention.orderPiiDays;
  const before = new Date(Date.now() - days * 86400_000);
  const res = await prisma.order.updateMany({
    where: { status: { in: ["COMPLETED", "CANCELLED"] }, updatedAt: { lt: before }, anonymizedAt: null },
    data: { customerName: "—", customerPhone: "—", customerComment: null, deliveryAddress: null, clientIpHash: null, anonymizedAt: new Date() },
  });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 2 * 86400_000) } } });
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (res.count) await prisma.auditLog.create({ data: { action: "orders.anonymize", entityType: "Order", summary: `Обезличено заявок: ${res.count} (старше ${days} дн.)` } });
  return { anonymized: res.count, days };
}
