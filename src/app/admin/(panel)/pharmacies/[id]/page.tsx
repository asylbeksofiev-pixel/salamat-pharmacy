import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { canAccessPharmacy } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { WEEKDAYS, parseOpeningHours } from "@/lib/hours";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, SelectField, TextArea } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { addPharmacyPhoto, deletePharmacyPhoto, savePharmacy } from "../actions";

export const metadata = { title: "Филиал" };
const DAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default async function PharmacyAdminPage({ params }: PageProps<"/admin/pharmacies/[id]">) {
  const user = await requireStaffPage("pharmacies.read");
  const { id } = await params;
  const p = await prisma.pharmacy.findUnique({ where: { id }, include: { source: true, photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } } });
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
      <Card title="Фотографии филиала">
        <p className="mb-4 text-sm text-muted">
          Показываются на сайте в карточке филиала и на его странице. Добавляйте только фото этого адреса, на которые у SALAMAT есть право:
          собственные снимки сети или фото, использование которых письменно разрешено автором. Фото с карт (2ГИС, Яндекс, Google) и из
          интернета без разрешения не публикуются.
        </p>
        {p.photos.length ? (
          <ul className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p.photos.map((ph) => (
              <li key={ph.id} className="overflow-hidden rounded-[var(--radius-md)] border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- preview of a staff-provided https photo */}
                <img src={ph.url} alt="" className="aspect-[16/10] w-full bg-surface object-cover" referrerPolicy="no-referrer" />
                <div className="flex flex-col gap-1 p-3 text-sm">
                  <span className="font-semibold">{ph.kind === "INTERIOR" ? "Торговый зал" : "Вид снаружи"}</span>
                  <span className="text-muted">{ph.source} · {ph.license}</span>
                  <span className="text-xs text-muted">Право подтверждено {formatDateTime(ph.rightsConfirmedAt)}</span>
                  {write ? (
                    <AdminForm action={deletePharmacyPhoto.bind(null, ph.id)} submitLabel="Удалить фото" submitVariant="outline" confirm="Удалить это фото с сайта?" inline />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-5 rounded-[var(--radius-md)] bg-surface p-3 text-sm text-muted">Подтверждённых фото пока нет — на сайте филиал показывается без фото.</p>
        )}
        {write ? (
          <AdminForm action={addPharmacyPhoto.bind(null, p.id)} submitLabel="Добавить фото" resetOnSuccess>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ссылка на фото (https://…)" name="url" required placeholder="https://…" />
              <SelectField label="Что на фото" name="kind" options={[{ value: "EXTERIOR", label: "Вид снаружи (вход, вывеска)" }, { value: "INTERIOR", label: "Торговый зал" }]} />
              <Field label="Кто предоставил фото" name="source" required placeholder="SALAMAT / имя фотографа" />
              <Field label="Условия использования" name="license" required placeholder="Собственность SALAMAT / разрешение автора от 20.11.2026" />
              <Field label="Ссылка на источник или разрешение (необязательно)" name="sourceUrl" placeholder="https://…" className="md:col-span-2" />
            </div>
            <CheckField label="Подтверждаю: на фото именно этот филиал, и у SALAMAT есть право публиковать его на сайте" name="rightsConfirmed" />
          </AdminForm>
        ) : null}
      </Card>
    </div>
  );
}
