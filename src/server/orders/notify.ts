import "server-only";
import { prisma } from "../db";
import { env } from "../env";

/** True when SMTP and at least one operator address are configured. */
export function emailConfigured(): boolean {
  return !!(env.smtp.host && env.smtp.from && env.operatorEmails.length);
}

/**
 * Sends a short notice to operators. Contains the order number, pharmacy and a link to the admin panel,
 * but no customer name or phone: operators open the order in the admin panel to see contacts.
 */
export async function notifyOperators(orderId: string): Promise<void> {
  if (!emailConfigured()) {
    await prisma.order.update({ where: { id: orderId }, data: { notifyError: "e-mail не настроен" } });
    return;
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { pharmacy: { select: { addressRu: true } }, items: { select: { nameSnapshot: true, quantity: true } } },
  });
  if (!order) return;
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
    const lines = order.items.map((i) => `• ${i.nameSnapshot} × ${i.quantity}`).join("\n");
    await transport.sendMail({
      from: env.smtp.from,
      to: env.operatorEmails,
      subject: `Новая заявка ${order.publicId} — ${order.pharmacy.addressRu}`,
      text: [
        `Новая заявка ${order.publicId}`,
        `Аптека: ${order.pharmacy.addressRu}`,
        `Позиций: ${order.items.length}`,
        lines,
        "",
        `Открыть в админ-панели: ${env.appUrl}/admin/orders/${order.id}`,
        "Контакты покупателя доступны в админ-панели уполномоченным сотрудникам.",
      ].join("\n"),
    });
    await prisma.order.update({ where: { id: orderId }, data: { notifiedAt: new Date(), notifyError: null } });
  } catch (e) {
    await prisma.order.update({
      where: { id: orderId },
      data: { notifyError: `ошибка отправки e-mail: ${(e as Error).message}`.slice(0, 300) },
    });
  }
}
