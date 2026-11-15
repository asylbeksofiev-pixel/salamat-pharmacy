import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, SelectField } from "@/components/admin/ui";
import { saveCategory, deleteCategory } from "./actions";

export const metadata = { title: "Категории" };
const ICONS = ["pill", "vitamin", "leaf", "device", "nutrition", "baby", "cosmetic", "tooth", "hygiene", "box"];

export default async function CategoriesPage() {
  await requireStaffPage("catalog.write");
  const cats = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameRu: "asc" }], include: { _count: { select: { products: true } } } });
  const roots = cats.filter((c) => !c.parentId);
  const ordered = roots.flatMap((r) => [r, ...cats.filter((c) => c.parentId === r.id)]);
  const orphans = cats.filter((c) => c.parentId && !ordered.includes(c));
  const parentOpts = [{ value: "", label: "— верхний уровень —" }, ...cats.map((c) => ({ value: c.id, label: c.nameRu }))];
  const fields = (c?: (typeof cats)[number]) => (
    <div className="grid gap-3 md:grid-cols-4">
      <Field label="Название (RU)" name="nameRu" required defaultValue={c?.nameRu} />
      <Field label="Название (KZ)" name="nameKk" defaultValue={c?.nameKk} />
      <Field label="Slug" name="slug" defaultValue={c?.slug} hint="Пусто — из названия" />
      <SelectField label="Родитель" name="parentId" defaultValue={c?.parentId} options={parentOpts.filter((o) => o.value !== c?.id)} />
      <Field label="Порядок" name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 100} />
      <SelectField label="Иконка" name="iconKey" defaultValue={c?.iconKey} options={[{ value: "", label: "—" }, ...ICONS.map((i) => ({ value: i, label: i }))]} />
      {c ? <CheckField label="Активна" name="isActive" defaultChecked={c.isActive} /> : null}
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Категории" description="Структура каталога. Подкатегории также создаются импортом из колонки category_path." />
      <Card title="Новая категория">
        <AdminForm action={saveCategory.bind(null, null)} submitLabel="Создать" resetOnSuccess>{fields()}</AdminForm>
      </Card>
      <Card title={`Все категории (${cats.length})`}>
        <ul className="flex flex-col gap-2">
          {[...ordered, ...orphans].map((c) => (
            <li key={c.id} className={c.parentId ? "ml-6" : ""}>
              <details className="rounded-[var(--radius-md)] border border-line">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="font-medium">{c.nameRu}{c.nameKk ? <span className="ml-2 text-sm text-muted">/ {c.nameKk}</span> : null}{!c.isActive ? <span className="ml-2 text-xs text-accent-600">скрыта</span> : null}</span>
                  <span className="text-xs text-muted">/{c.slug} · товаров: {c._count.products}</span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-line p-4">
                  <AdminForm action={saveCategory.bind(null, c.id)}>{fields(c)}</AdminForm>
                  <AdminForm action={deleteCategory.bind(null, c.id)} submitLabel="Удалить" submitVariant="ghost" inline confirm="Удалить категорию?" />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
