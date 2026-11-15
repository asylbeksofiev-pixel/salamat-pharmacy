import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, Field, PageHeader } from "@/components/admin/ui";
import { saveBrand } from "./actions";

export const metadata = { title: "Бренды" };

export default async function BrandsPage() {
  await requireStaffPage("catalog.write");
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Бренды" description="Бренды также создаются импортом из колонки brand." />
      <Card title="Новый бренд">
        <AdminForm action={saveBrand.bind(null, null)} submitLabel="Создать" resetOnSuccess inline>
          <Field label="Название" name="name" required />
          <Field label="Slug" name="slug" />
        </AdminForm>
      </Card>
      <Card title={`Бренды (${brands.length})`}>
        <ul className="flex flex-col divide-y divide-line">
          {brands.map((b) => (
            <li key={b.id} className="py-3">
              <AdminForm action={saveBrand.bind(null, b.id)} inline>
                <Field label="Название" name="name" defaultValue={b.name} required />
                <Field label="Slug" name="slug" defaultValue={b.slug} />
                <span className="pb-2 text-xs text-muted">товаров: {b._count.products}</span>
              </AdminForm>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
