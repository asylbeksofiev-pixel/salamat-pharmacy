import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can, canAccessPharmacy } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { formatDate, formatPhone } from "@/lib/format";
import { parseOpeningHours } from "@/lib/hours";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, Field, PageHeader, Table, Td } from "@/components/admin/ui";
import { createPharmacy } from "./actions";

export const metadata = { title: "Филиалы" };

export default async function PharmaciesAdmin() {
  const user = await requireStaffPage("pharmacies.read");
  const list = await prisma.pharmacy.findMany({ orderBy: { sortOrder: "asc" }, include: { city: true, _count: { select: { prices: true, inventories: true, orders: true } } } });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Филиалы" description="Адреса взяты с salamatfarmacia.kz (14.11.2026) и требуют подтверждения. Часы работы и координаты не публикуются, пока не внесены." />
      <Table head={["Код", "Адрес", "Телефоны", "Часы", "Координаты", "Цен / остатков", "Статус", "Проверено"]}>
        {list.map((p) => (
          <tr key={p.id} className="hover:bg-surface/60">
            <Td className="font-mono text-xs">{p.code}</Td>
            <Td>{canAccessPharmacy(user, "pharmacies.write", p.id) || can(user, "pharmacies.read") ? <Link href={`/admin/pharmacies/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.addressRu}</Link> : p.addressRu}<span className="block text-xs text-muted">{p.city.nameRu}</span></Td>
            <Td className="text-xs whitespace-nowrap">{p.phones.map(formatPhone).join(", ")}</Td>
            <Td className="text-xs">{parseOpeningHours(p.openingHours) ? "указаны" : <span className="text-warn-700">нет</span>}</Td>
            <Td className="text-xs">{p.latitude ? "есть" : <span className="text-warn-700">нет</span>}</Td>
            <Td className="text-xs">{p._count.prices} / {p._count.inventories}</Td>
            <Td className="text-xs">{p.isActive ? (p.acceptsOrders ? "работает" : "без заявок") : <span className="text-accent-600">скрыт</span>}</Td>
            <Td className="text-xs">{p.verifiedAt ? formatDate(p.verifiedAt) : <span className="text-warn-700">не подтверждено</span>}</Td>
          </tr>
        ))}
      </Table>
      {can(user, "settings.manage") ? (
        <Card title="Новый филиал">
          <AdminForm action={createPharmacy} submitLabel="Создать" inline>
            <Field label="Код (для импорта)" name="code" placeholder="SAL-15" required />
            <Field label="Адрес (RU)" name="addressRu" required className="min-w-80" />
          </AdminForm>
        </Card>
      ) : null}
    </div>
  );
}
