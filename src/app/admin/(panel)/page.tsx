import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can, pharmacyScope } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { emailConfigured } from "@/server/orders/notify";
import { env } from "@/server/env";
import { daysAgo, hoursAgo } from "@/server/time";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { Icon, type IconName } from "@/components/icons";

export const metadata = { title: "Обзор" };

function Stat({ label, value, href, icon, tone = "neutral" }: { label: string; value: number | string; href?: string; icon: IconName; tone?: "neutral" | "warn" | "danger" | "ok" }) {
  const toneCls = { neutral: "text-brand-700 bg-brand-50", warn: "text-warn-700 bg-warn-50", danger: "text-accent-700 bg-accent-50", ok: "text-brand-700 bg-brand-50" }[tone];
  const body = (
    <div className="flex h-full items-center gap-4 rounded-[var(--radius-lg)] border border-line bg-white p-5 transition-shadow hover:shadow-[var(--shadow-card)]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-full ${toneCls}`}><Icon name={icon} /></span>
      <span>
        <span className="block text-2xl font-bold">{value}</span>
        <span className="block text-sm text-muted">{label}</span>
      </span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function Dashboard({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaffPage("dashboard.view");
  const sp = await searchParams;
  const settings = await getSettings();
  const staleSince = hoursAgo(settings.offerPolicy.stockStaleHours);
  const orderScope = pharmacyScope(user, "orders.read");
  const orderWhere = orderScope === "all" ? {} : { pharmacyId: { in: orderScope } };
  const [newOrders, processing, noPrice, staleStock, drafts, failedImports, rejectedRows, lastImport, unverifiedPharmacies] = await Promise.all([
    can(user, "orders.read") ? prisma.order.count({ where: { ...orderWhere, status: "NEW" } }) : Promise.resolve(0),
    can(user, "orders.read") ? prisma.order.count({ where: { ...orderWhere, status: { in: ["PROCESSING", "CONFIRMED", "READY"] } } }) : Promise.resolve(0),
    prisma.productVariant.count({ where: { isActive: true, product: { publicationStatus: "PUBLISHED" }, prices: { none: {} } } }),
    prisma.inventory.count({ where: { sourceUpdatedAt: { lt: staleSince } } }),
    prisma.product.count({ where: { publicationStatus: "DRAFT" } }),
    prisma.importJob.count({ where: { status: "FAILED" } }),
    prisma.importError.count({ where: { severity: "ERROR", job: { createdAt: { gt: daysAgo(30) } } } }),
    prisma.importJob.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.pharmacy.count({ where: { isActive: true, verifiedAt: null } }),
  ]);
  return (
    <div>
      <PageHeader title={`Здравствуйте, ${user.name}`} description="Сводка по заявкам и качеству данных" />
      <div className="mb-6 flex flex-col gap-3">
        {sp.denied ? <Notice tone="danger">Недостаточно прав для открытого раздела.</Notice> : null}
        {env.showDemoData ? <Notice tone="warning">Включён показ демонстрационных данных (SHOW_DEMO_DATA). Отключите перед запуском.</Notice> : null}
        {!emailConfigured() && can(user, "settings.manage") ? <Notice tone="info">E-mail-уведомления о заявках не настроены (SMTP_*, OPERATOR_EMAILS). Заявки сохраняются в базе и видны в разделе «Заявки».</Notice> : null}
        {unverifiedPharmacies && can(user, "pharmacies.read") ? <Notice tone="warning">Филиалов без подтверждённых сведений: {unverifiedPharmacies}. Проверьте адреса, телефоны и часы работы.</Notice> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can(user, "orders.read") ? <Stat label="Новые заявки" value={newOrders} href="/admin/orders?status=NEW" icon="cart" tone={newOrders ? "danger" : "ok"} /> : null}
        {can(user, "orders.read") ? <Stat label="В работе" value={processing} href="/admin/orders" icon="clock" /> : null}
        <Stat label="Опубликованные SKU без цен" value={noPrice} href="/admin/products?noprice=1" icon="tag" tone={noPrice ? "warn" : "ok"} />
        <Stat label={`Устаревшие остатки (> ${settings.offerPolicy.stockStaleHours} ч)`} value={staleStock} href="/admin/inventory?stale=1" icon="history" tone={staleStock ? "warn" : "ok"} />
        <Stat label="Товары-черновики" value={drafts} href="/admin/products?status=DRAFT" icon="edit" tone={drafts ? "warn" : "ok"} />
        <Stat label="Ошибки импорта за 30 дней" value={rejectedRows} href="/admin/import" icon="alert" tone={rejectedRows ? "danger" : "ok"} />
        <Stat label="Неудачные импорты" value={failedImports} href="/admin/import" icon="xCircle" tone={failedImports ? "danger" : "ok"} />
        <Stat label="Последний импорт" value={lastImport ? lastImport.createdAt.toLocaleDateString("ru-KZ") : "—"} href="/admin/import" icon="upload" />
      </div>
    </div>
  );
}
