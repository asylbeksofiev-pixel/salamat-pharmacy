import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, SelectField, TextArea } from "@/components/admin/ui";
import { savePage } from "../actions";

export const metadata = { title: "Страница" };

export default async function PageEdit({ params }: PageProps<"/admin/content/[slug]">) {
  await requireStaffPage("content.write");
  const { slug } = await params;
  const p = await prisma.contentPage.findUnique({ where: { slug } });
  if (!p) notFound();
  return (
    <div>
      <PageHeader title={p.titleRu} description={<>Адрес: <a className="text-brand-700 hover:underline" href={`/${p.slug}`} target="_blank">/{p.slug}</a> · Markdown: ## заголовок, **жирный**, * список. HTML не поддерживается.</>} />
      <Card>
        <AdminForm action={savePage.bind(null, p.slug)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Заголовок (RU)" name="titleRu" required defaultValue={p.titleRu} />
            <Field label="Заголовок (KZ)" name="titleKk" defaultValue={p.titleKk} />
            <TextArea label="Текст (RU, Markdown)" name="bodyRu" required defaultValue={p.bodyRu} rows={18} />
            <TextArea label="Текст (KZ, Markdown) — пусто: показывается русский текст с пометкой" name="bodyKk" defaultValue={p.bodyKk} rows={18} />
            <Field label="Описание для поисковиков (RU)" name="metaDescriptionRu" defaultValue={p.metaDescriptionRu} />
            <Field label="Описание для поисковиков (KZ)" name="metaDescriptionKk" defaultValue={p.metaDescriptionKk} />
            <SelectField label="Статус" name="status" defaultValue={p.status} options={[{ value: "PUBLISHED", label: "Опубликована" }, { value: "DRAFT", label: "Черновик (страница недоступна)" }]} />
            <CheckField label="Требует юридической проверки (показывать пометку «черновик», не индексировать)" name="requiresLegalReview" defaultChecked={p.requiresLegalReview} />
          </div>
        </AdminForm>
      </Card>
    </div>
  );
}
