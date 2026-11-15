import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { apiProviderFromEnv } from "@/server/import/providers";
import { IMPORT_COLUMNS } from "@/server/import/validate";
import { formatDateTime } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, StatusPill, Table, Td } from "@/components/admin/ui";
import { syncFromApi, uploadImport } from "./actions";

export const metadata = { title: "Импорт и экспорт" };
const STATUS_RU = { PREVIEW: "Предпросмотр", APPLYING: "Применяется", COMPLETED: "Применён", FAILED: "Ошибка", CANCELLED: "Отменён" } as const;

export default async function ImportPage() {
  await requireStaffPage("catalog.import");
  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { source: true, createdBy: { select: { name: true } } } });
  const api = apiProviderFromEnv();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Импорт и экспорт ассортимента"
        description="Файл сначала проверяется и показывается предпросмотр — каталог меняется только после подтверждения. Товары, отсутствующие в файле, не удаляются."
        actions={
          <a href="/api/admin/export" download className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-white px-4 text-sm font-semibold hover:border-brand-600">Экспорт каталога (CSV)</a>}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card title="Загрузить файл">
          <AdminForm action={uploadImport} submitLabel="Проверить файл">
            <div className="flex flex-col gap-1">
              <label htmlFor="file" className="text-sm font-medium">Файл .csv или .xlsx (до 10 МБ, до 50 000 строк)</label>
              <input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="rounded-[var(--radius-md)] border border-line-strong bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-800" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Код источника" name="sourceCode" defaultValue="salamat-1c" hint="Сопоставление по external_id идёт внутри источника" />
              <Field label="Название источника" name="sourceName" defaultValue="Выгрузка из учётной системы SALAMAT" />
            </div>
            <CheckField label="Сразу публиковать новые товары" name="publishNew" hint="По умолчанию новые товары создаются черновиками и появляются на сайте только после проверки" />
          </AdminForm>
        </Card>
        <Card title="Шаблон и правила">
          <ul className="flex flex-col gap-2 text-sm">
            <li><a className="font-semibold text-brand-700 hover:underline" href="/templates/catalog-import-template.xlsx" download>Шаблон XLSX</a> (с листом описания колонок)</li>
            <li><a className="font-semibold text-brand-700 hover:underline" href="/templates/catalog-import-template.csv" download>Шаблон CSV</a> (UTF-8, разделитель «,» или «;»)</li>
          </ul>
          <p className="mt-3 text-sm text-muted">Обязательны <code>product_name</code>, <code>full_variant_name</code> и хотя бы одно из <code>external_id</code>, <code>salamat_sku</code>, <code>barcode</code>. Сопоставление: external_id (в рамках источника) → salamat_sku → barcode.</p>
          <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer">Все колонки</summary><p className="mt-2 font-mono break-words">{IMPORT_COLUMNS.join(", ")}, old_price_kzt, stock_status, product_name_kk, search_aliases</p></details>
          <div className="mt-4 border-t border-line pt-4">
            {api ? (
              <AdminForm action={syncFromApi} submitLabel={`Получить из API: ${api.name}`} submitVariant="secondary" />
            ) : (
              <p className="text-sm text-muted">API учётной системы не подключён. Для подключения задайте CATALOG_API_URL и CATALOG_API_TOKEN (docs/data-import.md).</p>
            )}
          </div>
        </Card>
      </div>
      <Card title="История импорта">
        <Table head={["Дата", "Файл", "Источник", "Сотрудник", "Строк", "Новых", "Изменено", "Без изм.", "Отклонено", "Статус"]} empty={jobs.length ? undefined : "Импортов ещё не было"}>
          {jobs.map((j) => (
            <tr key={j.id} className="hover:bg-surface/60">
              <Td className="whitespace-nowrap"><Link href={`/admin/import/${j.id}`} className="font-medium text-brand-700 hover:underline">{formatDateTime(j.createdAt)}</Link></Td>
              <Td className="max-w-56 truncate">{j.fileName}</Td>
              <Td className="text-xs">{j.source.isDemo ? "ДЕМО" : j.source.name}</Td>
              <Td className="text-xs">{j.createdBy?.name ?? "скрипт"}</Td>
              <Td>{j.totalRows}</Td>
              <Td>{j.createdCount}</Td>
              <Td>{j.updatedCount}</Td>
              <Td>{j.skippedCount}</Td>
              <Td className={j.rejectedCount ? "font-semibold text-accent-600" : ""}>{j.rejectedCount}</Td>
              <Td><StatusPill status={j.status} label={STATUS_RU[j.status]} /></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
