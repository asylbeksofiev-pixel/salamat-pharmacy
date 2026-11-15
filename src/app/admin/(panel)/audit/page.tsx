import type { Prisma } from "@prisma/client";
import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { AdminPagination, PageHeader, Table, Td, inputCls } from "@/components/admin/ui";

export const metadata = { title: "История изменений" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaffPage("audit.read");
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" ? sp.entity : "";
  const userId = typeof sp.user === "string" ? sp.user : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditLogWhereInput = { ...(entity ? { entityType: entity } : {}), ...(userId ? { adminUserId: userId } : {}) };
  const [logs, total, entities, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE, skip: (page - 1) * PAGE, include: { adminUser: { select: { name: true, email: true } } } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entityType"], _count: true }),
    prisma.adminUser.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const qs = (p: number) => `/admin/audit?${new URLSearchParams({ ...(entity ? { entity } : {}), ...(userId ? { user: userId } : {}), page: String(p) })}`;
  return (
    <div>
      <PageHeader title="История изменений" description="Кто, когда и что изменил. Контактные данные покупателей в журнал не записываются." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">Объект
          <select name="entity" defaultValue={entity} className={inputCls}><option value="">Все</option>{entities.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType} ({e._count})</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Сотрудник
          <select name="user" defaultValue={userId} className={inputCls}><option value="">Все</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </label>
        <button className="h-10 rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white">Показать</button>
      </form>
      <Table head={["Когда", "Кто", "Действие", "Объект", "Описание", "Изменения"]} empty={logs.length ? undefined : "Записей нет"}>
        {logs.map((l) => (
          <tr key={l.id}>
            <Td className="text-xs whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
            <Td className="text-xs">{l.adminUser?.name ?? "система"}</Td>
            <Td className="font-mono text-xs">{l.action}</Td>
            <Td className="text-xs">{l.entityType}</Td>
            <Td>{l.summary}</Td>
            <Td className="max-w-72">{l.diff ? <details><summary className="cursor-pointer text-xs text-brand-700">показать</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-surface p-2 text-[0.7rem] whitespace-pre-wrap">{JSON.stringify(l.diff, null, 2)}</pre></details> : null}</Td>
          </tr>
        ))}
      </Table>
      <AdminPagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={qs} />
    </div>
  );
}
