import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { ROLE_CODES, ROLE_LABELS, ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader } from "@/components/admin/ui";
import { createStaff, updateStaff } from "./actions";

export const metadata = { title: "Сотрудники и роли" };

export default async function StaffPage() {
  await requireStaffPage("staff.manage");
  const [users, pharmacies] = await Promise.all([
    prisma.adminUser.findMany({ orderBy: { createdAt: "asc" }, include: { roles: { include: { role: true } }, pharmacies: true } }),
    prisma.pharmacy.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true, addressRu: true } }),
  ]);
  const roleBoxes = (selected: string[]) => (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">Роли (можно несколько)</legend>
      {ROLE_CODES.map((r) => <CheckField key={r} label={ROLE_LABELS[r]} name="roles" value={r} defaultChecked={selected.includes(r)} hint={ROLE_PERMISSIONS[r].join(", ")} />)}
    </fieldset>
  );
  const pharmacyBoxes = (selected: string[]) => (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">Назначенные филиалы</legend>
      <p className="mb-1 text-xs text-muted">Менеджер филиала управляет только ими; оператор с назначенными филиалами видит только их заявки.</p>
      <div className="grid max-h-56 gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-line p-2">
        {pharmacies.map((p) => <CheckField key={p.id} label={`${p.code} · ${p.addressRu}`} name="pharmacyIds" value={p.id} defaultChecked={selected.includes(p.id)} />)}
      </div>
    </fieldset>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Сотрудники и роли" description="Права проверяются на сервере для каждого действия. Изменение ролей завершает активные сессии сотрудника." />
      <Card title={`Сотрудники (${users.length})`}>
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id}>
              <details className="rounded-[var(--radius-md)] border border-line">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span><b>{u.name}</b> <span className="text-sm text-muted">{u.email}</span>{!u.isActive ? <span className="ml-2 text-xs text-accent-600">деактивирован</span> : null}</span>
                  <span className="text-xs text-muted">{u.roles.map((r) => ROLE_LABELS[r.role.code]).join(", ")} · вход: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "не входил"}</span>
                </summary>
                <div className="border-t border-line p-4">
                  <AdminForm action={updateStaff.bind(null, u.id)}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Имя" name="name" defaultValue={u.name} />
                      <Field label="Новый пароль (пусто — не менять)" name="password" type="password" />
                      {roleBoxes(u.roles.map((r) => r.role.code))}
                      {pharmacyBoxes(u.pharmacies.map((p) => p.pharmacyId))}
                      <CheckField label="Активен" name="isActive" defaultChecked={u.isActive} />
                    </div>
                  </AdminForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Новый сотрудник">
        <AdminForm action={createStaff} submitLabel="Создать" resetOnSuccess>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="E-mail" name="email" type="email" required />
            <Field label="Имя" name="name" required />
            <Field label="Пароль" name="password" type="password" required hint="Не короче 10 символов, буквы и цифры" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {roleBoxes([])}
            {pharmacyBoxes([])}
          </div>
        </AdminForm>
      </Card>
    </div>
  );
}
