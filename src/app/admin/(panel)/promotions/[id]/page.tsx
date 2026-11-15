import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { Card, PageHeader } from "@/components/admin/ui";
import { PromotionForm } from "../PromotionForm";

export const metadata = { title: "Акция" };

export default async function PromotionEdit({ params }: PageProps<"/admin/promotions/[id]">) {
  await requireStaffPage("promotions.write");
  const { id } = await params;
  const [p, pharmacies, categories] = await Promise.all([
    prisma.promotion.findUnique({ where: { id }, include: { variants: { include: { variant: { select: { salamatSku: true, slug: true } } } }, categories: true, pharmacies: true } }),
    prisma.pharmacy.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, addressRu: true } }),
    prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }], select: { id: true, nameRu: true, parentId: true } }),
  ]);
  if (!p) notFound();
  return (
    <div>
      <PageHeader title={p.titleRu} description={<a className="text-brand-700 hover:underline" href={`/promotions/${p.slug}`} target="_blank">Страница акции на сайте</a>} />
      <Card>
        <PromotionForm
          promo={{ ...p, skus: p.variants.map((v) => v.variant.salamatSku ?? v.variant.slug), pharmacyIds: p.pharmacies.map((x) => x.pharmacyId), categoryIds: p.categories.map((x) => x.categoryId) }}
          pharmacies={pharmacies}
          categories={categories}
        />
      </Card>
    </div>
  );
}
