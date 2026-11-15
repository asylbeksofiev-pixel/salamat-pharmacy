import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, PageHeader } from "@/components/admin/ui";
import { ProductFields } from "../ProductFields";
import { createProduct } from "../actions";

export const metadata = { title: "Новый товар" };

export default async function NewProductPage() {
  await requireStaffPage("catalog.write");
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] }),
  ]);
  return (
    <div>
      <PageHeader title="Новый товар" description="Товар создаётся черновиком. После добавления вариантов (SKU) его можно опубликовать." />
      <Card>
        <AdminForm action={createProduct} submitLabel="Создать">
          <ProductFields brands={brands} categories={categories} />
        </AdminForm>
      </Card>
    </div>
  );
}
