import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { canAccessPharmacy } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { WEEKDAYS, parseOpeningHours } from "@/lib/hours";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, TextArea } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { savePharmacy } from "../actions";

export const metadata = { title: "Филиал" };
const DAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default async function PharmacyAdminPage({ params }: PageProps<"/admin/pharmacies/[id]">) {
  const user = await requireStaffPage("pharmacies.read");
  const { id } = await params;
  const p = await prisma.pharmacy.findUnique({ where: { id }, include: { source: true } });
  if (!p) notFound();
  const write = canAccessPharmacy(user, "pharmacies.write", p.id);
  const hours = parseOpeningHours(p.openingHours);
  const fields = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Адрес (RU)" name="addressRu" required defaultValue={p.addressRu} />
        <Field label="Адрес (KZ) — только утверждённый перевод" name="addressKk" defaultValue={p.addressKk} />
        <Field label="Название (необязательно)" name="name" defaultValue={p.name} />
        <Field label="Телефоны (через запятую)" name="phones" defaultValue={p.phones.join(", ")} />
        <Field label="Широта" name="latitude" defaultValue={p.latitude?.toString()} placeholder="51.128" />
        <Field label="Долгота" name="longitude" defaultValue={p.longitude?.toString()} placeholder="71.430" />
      </div>
      <fieldset className="rounded-[var(--radius-md)] border border-line p-4">
        <legend className="px-1 text-sm font-semibold">Часы работы</legend>
        <CheckField label="График подтверждён и может публиковаться" name="hoursConfirmed" defaultChecked={!!hours} hint="Без отметки сайт пишет «Часы работы уточняются» и не показывает «Открыто/Закрыто»" />
        <div className="mt-3 grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {WEEKDAYS.map((d, i) => <Field key={d} label={DAYS_RU[i]} name={`hours_${d}`} defaultValue={hours?.[d]?.join(", ")} placeholder="09:00-21:00" />)}
        </div>
        <p className="mt-2 text-xs text-muted">Формат ЧЧ:ММ-ЧЧ:ММ; перерыв — два интервала через запятую; круглосуточно — 00:00-24:00; пусто — выходной.</p>
        <Field label="Примечание к графику" name="hoursNote" defaultValue={p.hoursNote} className="mt-3" />
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <CheckField label="Показывать на сайте" name="isActive" defaultChecked={p.isActive} />
        <CheckField label="Принимает заявки с сайта" name="acceptsOrders" defaultChecked={p.acceptsOrders} />
        <CheckField label="Сведения проверены сегодня" name="verifyNow" hint="Отмечает дату подтверждения адреса, телефонов и графика" />
      </div>
      <TextArea label="Служебная заметка" name="internalNote" defaultValue={p.internalNote} rows={2} />
    </>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={p.addressRu} description={`Код для импорта: ${p.code} · источник: ${p.source?.name ?? "—"} · проверено: ${p.verifiedAt ? formatDateTime(p.verifiedAt) : "нет"}`} />
      {p.sourceAddress && p.sourceAddress !== p.addressRu ? <Notice tone="info">Адрес в источнике: «{p.sourceAddress}»</Notice> : null}
      <Card>
        {write ? <AdminForm action={savePharmacy.bind(null, p.id)}>{fields}</AdminForm> : <fieldset disabled className="flex flex-col gap-4 opacity-80">{fields}<p className="text-sm text-muted">Изменять может менеджер этого филиала или Super Admin.</p></fieldset>}
      </Card>
    </div>
  );
}
