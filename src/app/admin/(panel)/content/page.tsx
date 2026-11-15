import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, StatusPill, Table, Td, TextArea } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { deleteFaq, saveFaq } from "./actions";

export const metadata = { title: "Страницы и FAQ" };

export default async function ContentAdmin() {
  await requireStaffPage("content.write");
  const [pages, faq] = await Promise.all([prisma.contentPage.findMany({ orderBy: { slug: "asc" } }), prisma.fAQItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })]);
  const faqFields = (f?: (typeof faq)[number]) => (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Вопрос (RU)" name="questionRu" required defaultValue={f?.questionRu} />
      <Field label="Вопрос (KZ)" name="questionKk" defaultValue={f?.questionKk} />
      <TextArea label="Ответ (RU)" name="answerRu" required defaultValue={f?.answerRu} rows={3} />
      <TextArea label="Ответ (KZ)" name="answerKk" defaultValue={f?.answerKk} rows={3} />
      <Field label="Порядок" name="sortOrder" type="number" defaultValue={f?.sortOrder ?? 100} />
      {f ? <CheckField label="Опубликован" name="isPublished" defaultChecked={f.isPublished} /> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Страницы и FAQ" />
      <Notice tone="warning">Не публикуйте медицинские статьи и рекомендации по лечению. Юридические документы (политика, условия) должен утвердить юрист SALAMAT — до этого на сайте показывается пометка «черновик».</Notice>
      <Table head={["Страница", "Адрес", "Статус", "Юр. проверка", "KZ-версия", "Изменена"]}>
        {pages.map((p) => (
          <tr key={p.id}>
            <Td><Link href={`/admin/content/${p.slug}`} className="font-semibold text-brand-700 hover:underline">{p.titleRu}</Link></Td>
            <Td className="font-mono text-xs">/{p.slug}</Td>
            <Td><StatusPill status={p.status} label={p.status === "PUBLISHED" ? "Опубликована" : p.status === "DRAFT" ? "Черновик" : "Архив"} /></Td>
            <Td>{p.requiresLegalReview ? <span className="text-warn-700">требуется</span> : "—"}</Td>
            <Td>{p.bodyKk ? "есть" : <span className="text-warn-700">нет</span>}</Td>
            <Td className="text-xs">{formatDateTime(p.updatedAt)}</Td>
          </tr>
        ))}
      </Table>
      <Card title={`FAQ (${faq.length})`}>
        <ul className="flex flex-col gap-2">
          {faq.map((f) => (
            <li key={f.id}>
              <details className="rounded-[var(--radius-md)] border border-line">
                <summary className="cursor-pointer px-4 py-2.5 font-medium">{f.questionRu}{!f.isPublished ? <span className="ml-2 text-xs text-muted">скрыт</span> : null}</summary>
                <div className="flex flex-col gap-3 border-t border-line p-4">
                  <AdminForm action={saveFaq.bind(null, f.id)}>{faqFields(f)}</AdminForm>
                  <AdminForm action={deleteFaq.bind(null, f.id)} submitLabel="Удалить" submitVariant="ghost" inline confirm="Удалить вопрос?" />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line-strong">
          <summary className="cursor-pointer px-4 py-2.5 font-semibold text-brand-700">+ Добавить вопрос</summary>
          <div className="border-t border-line p-4"><AdminForm action={saveFaq.bind(null, null)} submitLabel="Добавить" resetOnSuccess>{faqFields()}</AdminForm></div>
        </details>
      </Card>
    </div>
  );
}
