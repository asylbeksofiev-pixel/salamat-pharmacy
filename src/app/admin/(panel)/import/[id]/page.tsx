import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { draftProductsOfJob } from "@/server/import/pipeline";
import type { NormalizedRow } from "@/server/import/validate";
import { formatDateTime } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, PageHeader, StatusPill, Table, Td } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { applyImportAction, cancelImportAction, publishJobDrafts } from "../actions";

export const metadata = { title: "Импорт" };
const ACTION_RU = { CREATE: "новый", UPDATE: "изменение", SKIP: "без изменений", REJECT: "отклонено" } as const;
const STATUS_RU = { PREVIEW: "Предпросмотр", APPLYING: "Применяется", COMPLETED: "Применён", FAILED: "Ошибка", CANCELLED: "Отменён" } as const;

export default async function ImportJobPage({ params }: PageProps<"/admin/import/[id]">) {
  const user = await requireStaffPage("catalog.import");
  const { id } = await params;
  const job = await prisma.importJob.findUnique({ where: { id }, include: { source: true, createdBy: { select: { name: true } } } });
  if (!job) notFound();
  const [errors, errorCount, warnCount, rows] = await Promise.all([
    prisma.importError.findMany({ where: { jobId: id }, orderBy: [{ severity: "asc" }, { rowNumber: "asc" }], take: 300 }),
    prisma.importError.count({ where: { jobId: id, severity: "ERROR" } }),
    prisma.importError.count({ where: { jobId: id, severity: "WARNING" } }),
    prisma.importRow.findMany({ where: { jobId: id }, orderBy: { rowNumber: "asc" }, take: 60 }),
  ]);
  const drafts = job.status === "COMPLETED" ? await draftProductsOfJob(id) : [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`Импорт: ${job.fileName}`}
        description={`${formatDateTime(job.createdAt)} · ${job.source.name} · ${job.createdBy?.name ?? "скрипт"}${job.appliedAt ? ` · применён ${formatDateTime(job.appliedAt)}` : ""}`}
        actions={<StatusPill status={job.status} label={STATUS_RU[job.status]} />}
      />
      {job.errorMessage ? <Notice tone={job.status === "FAILED" ? "danger" : "warning"}>{job.errorMessage}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Строк в файле", job.totalRows],
          [job.status === "COMPLETED" ? "Добавлено SKU" : "Будет добавлено", job.createdCount],
          [job.status === "COMPLETED" ? "Изменено строк" : "Будет изменено", job.updatedCount],
          ["Без изменений", job.skippedCount],
          ["Отклонено строк", job.rejectedCount],
          ["Предупреждений", warnCount],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-[var(--radius-lg)] border border-line bg-white p-4">
            <p className="text-2xl font-bold">{v}</p>
            <p className="text-xs text-muted">{l}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {job.status === "PREVIEW" ? (
          <>
            <AdminForm action={applyImportAction.bind(null, job.id)} submitLabel={`Применить (${job.createdCount + job.updatedCount} строк)`} confirm={job.rejectedCount ? `Отклонённые строки (${job.rejectedCount}) не будут загружены. Продолжить?` : undefined} inline />
            <AdminForm action={cancelImportAction.bind(null, job.id)} submitLabel="Отменить" submitVariant="outline" inline />
          </>
        ) : null}
        {errorCount + warnCount ? <a href={`/api/admin/import/${job.id}/report`} className="inline-flex h-9 items-center rounded-[var(--radius-md)] border border-line-strong bg-white px-3 text-sm font-semibold hover:border-brand-600">Скачать отчёт об ошибках (CSV)</a> : null}
        {drafts.length && can(user, "catalog.write") ? <AdminForm action={publishJobDrafts.bind(null, job.id)} submitLabel={`Опубликовать проверенные товары (${drafts.length})`} submitVariant="secondary" inline confirm="Опубликовать все черновики, созданные этим импортом?" /> : null}
      </div>
      {job.status === "PREVIEW" && !job.publishNew ? <Notice tone="info">Новые товары будут созданы черновиками и не появятся на сайте до проверки и публикации.</Notice> : null}
      <Card title={`Ошибки и предупреждения (${errorCount} ошибок, ${warnCount} предупреждений)`}>
        <Table head={["Строка", "Тип", "Колонка", "Код", "Сообщение", "Значение"]} empty={errors.length ? undefined : "Ошибок нет"}>
          {errors.map((e) => (
            <tr key={e.id}>
              <Td>{e.rowNumber}</Td>
              <Td><span className={e.severity === "ERROR" ? "font-semibold text-accent-600" : "text-warn-700"}>{e.severity === "ERROR" ? "ошибка" : "предупр."}</span></Td>
              <Td className="font-mono text-xs">{e.column ?? "—"}</Td>
              <Td className="font-mono text-xs">{e.code}</Td>
              <Td>{e.message}</Td>
              <Td className="max-w-48 truncate font-mono text-xs">{e.rawValue ?? ""}</Td>
            </tr>
          ))}
        </Table>
        {errorCount + warnCount > errors.length ? <p className="mt-2 text-sm text-muted">Показаны первые {errors.length}. Полный список — в CSV-отчёте.</p> : null}
      </Card>
      {rows.length ? (
        <Card title="Предпросмотр строк (первые 60)">
          <Table head={["Строка", "Действие", "Сопоставление", "SKU", "Аптека", "Цена", "Остаток", "Дата данных"]}>
            {rows.map((r) => {
              const d = r.data as unknown as NormalizedRow;
              const act = r.resultAction ?? r.plannedAction;
              return (
                <tr key={r.id}>
                  <Td>{r.rowNumber}</Td>
                  <Td>{ACTION_RU[act]}</Td>
                  <Td className="text-xs">{r.matchRule ?? (act === "CREATE" ? "новый SKU" : "—")}</Td>
                  <Td>{d.fullName}<span className="block text-xs text-muted">{d.externalId ?? d.salamatSku ?? d.barcode}</span></Td>
                  <Td className="font-mono text-xs">{d.pharmacyCode ?? "—"}</Td>
                  <Td>{d.priceKzt ?? "—"}</Td>
                  <Td>{d.stockQuantity ?? d.stockStatus ?? "—"}</Td>
                  <Td className="text-xs whitespace-nowrap">{d.updatedAt ? formatDateTime(d.updatedAt) : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
