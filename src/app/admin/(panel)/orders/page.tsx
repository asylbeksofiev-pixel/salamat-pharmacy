import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireStaffPage } from "@/server/auth/session";
import { can, pharmacyScope } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { ORDER_STATUSES, ORDER_STATUS_LABELS_RU, type OrderStatusValue } from "@/lib/order-status";
import { formatDateTime, formatKzt } from "@/lib/format";
import { maskPhone } from "@/lib/phone";
import { AdminPagination, PageHeader, StatusPill, Table, Td, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Заявки" };
const PAGE = 30;

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const user = await requireStaffPage("orders.read");
  const sp = await searchParams;
  const scope = pharmacyScope(user, "orders.read");
  const status = typeof sp.status === "string" && (ORDER_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as OrderStatusValue) : undefined;
  const pharmacyId = typeof sp.pharmacy === "string" ? sp.pharmacy : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().toUpperCase().slice(0, 20) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = {
    ...(scope === "all" ? {} : { pharmacyId: { in: scope } }),
    ...(pharmacyId && (scope === "all" || scope.includes(pharmacyId)) ? { pharmacyId } : {}),
    ...(status ? { status } : {}),
    ...(q ? { publicId: { contains: q } } : {}),
  };
  const [orders, total, pharmacies, counts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE, include: { pharmacy: { select: { addressRu: true } }, _count: { select: { items: true } } } }),
    prisma.order.count({ where }),
    prisma.pharmacy.findMany({ where: scope === "all" ? {} : { id: { in: scope } }, orderBy: { sortOrder: "asc" }, select: { id: true, addressRu: true } }),
    prisma.order.groupBy({ by: ["status"], where: scope === "all" ? {} : { pharmacyId: { in: scope } }, _count: true }),
  ]);
  const showContacts = can(user, "orders.contacts");
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (status) u.set("status", status);
    if (pharmacyId) u.set("pharmacy", pharmacyId);
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
    return `/admin/orders${u.toString() ? `?${u}` : ""}`;
  };
  return (
    <div>
      <PageHeader title="Заявки" description="Заявка становится заказом только после подтверждения оператором." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/orders" className={`rounded-full px-3 py-1.5 text-sm font-medium ${!status ? "bg-brand-600 text-white" : "bg-white border border-line"}`}>Все</Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={`/admin/orders?status=${s}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${status === s ? "bg-brand-600 text-white" : "bg-white border border-line"}`}>
            {ORDER_STATUS_LABELS_RU[s]} <span className="opacity-70">{counts.find((c) => c.status === s)?._count ?? 0}</span>
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label className="flex flex-col gap-1 text-sm">Аптека
          <select name="pharmacy" defaultValue={pharmacyId ?? ""} className={`${inputCls} min-w-64`}>
            <option value="">Все доступные</option>
            {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.addressRu}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Номер заявки
          <input name="q" defaultValue={q} className={inputCls} placeholder="S-XXXX" />
        </label>
        <button className="h-10 rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white">Показать</button>
      </form>
      <Table head={["Номер", "Создана", "Аптека", "Позиций", "Сумма", showContacts ? "Телефон" : "", "Статус", "Уведомление"]} empty={orders.length ? undefined : "Заявок нет"}>
        {orders.map((o) => (
          <tr key={o.id} className="hover:bg-surface/60">
            <Td><Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-brand-700 hover:underline">{o.publicId}</Link></Td>
            <Td className="whitespace-nowrap">{formatDateTime(o.createdAt)}</Td>
            <Td>{o.pharmacy.addressRu}</Td>
            <Td>{o._count.items}</Td>
            <Td className="whitespace-nowrap">{o.totalKzt ? formatKzt(o.totalKzt) : "—"}{o.hasUnpricedItems ? <span className="block text-xs text-warn-700">есть позиции без цены</span> : null}</Td>
            <Td className="whitespace-nowrap font-mono text-xs">{showContacts && o.customerPhone.startsWith("+") ? maskPhone(o.customerPhone) : ""}</Td>
            <Td><StatusPill status={o.status} label={ORDER_STATUS_LABELS_RU[o.status]} /></Td>
            <Td className="text-xs">{o.notifiedAt ? "отправлено" : <span className="text-muted">{o.notifyError ?? "—"}</span>}</Td>
          </tr>
        ))}
      </Table>
      <AdminPagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={qs} />
    </div>
  );
}
