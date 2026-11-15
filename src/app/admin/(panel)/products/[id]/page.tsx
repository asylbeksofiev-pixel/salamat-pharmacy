import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { formatDateTime, formatKzt } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { Card, CheckField, Field, PageHeader, SelectField, StatusPill } from "@/components/admin/ui";
import { ProductFields } from "../ProductFields";
import { saveVariant, setProductStatus, toggleFeatured, updateProduct } from "../actions";

export const metadata = { title: "Товар" };
const RX = [
  { value: "UNKNOWN", label: "Не подтверждён" },
  { value: "NON_PRESCRIPTION", label: "Подтверждён: без рецепта" },
  { value: "PRESCRIPTION", label: "Подтверждён: по рецепту" },
];

function VariantFields({ v }: { v?: { fullName: string; dosage: string | null; form: string | null; volume: string | null; packageSize: string | null; packageQuantity: number | null; prescriptionStatus: string; barcode: string | null; salamatSku: string | null; externalId: string | null; imageUrl: string | null; isActive: boolean } }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Полное наименование SKU" name="fullName" required defaultValue={v?.fullName} className="md:col-span-3" hint="Название + дозировка + форма + упаковка, например «Парацетамол 500 мг №20 табл.»" />
      <Field label="Дозировка" name="dosage" defaultValue={v?.dosage} />
      <Field label="Форма выпуска" name="form" defaultValue={v?.form} />
      <Field label="Объём / масса" name="volume" defaultValue={v?.volume} />
      <Field label="Упаковка (как на этикетке)" name="packageSize" defaultValue={v?.packageSize} placeholder="№20" />
      <Field label="Кол-во в упаковке" name="packageQuantity" type="number" defaultValue={v?.packageQuantity} />
      <SelectField label="Рецептурность" name="prescriptionStatus" defaultValue={v?.prescriptionStatus ?? "UNKNOWN"} options={RX} />
      <Field label="Артикул SALAMAT" name="salamatSku" defaultValue={v?.salamatSku} />
      <Field label="Штрихкод (GTIN)" name="barcode" defaultValue={v?.barcode} />
      <Field label="Внешний ID (учётная система)" name="externalId" defaultValue={v?.externalId} />
      <Field label="Изображение (https, из разрешённого источника)" name="imageUrl" defaultValue={v?.imageUrl} className="md:col-span-3" />
      {v ? <CheckField label="Активен (показывать на сайте)" name="isActive" defaultChecked={v.isActive} /> : null}
    </div>
  );
}

export default async function ProductEditPage({ params }: PageProps<"/admin/products/[id]">) {
  const user = await requireStaffPage("catalog.read");
  const { id } = await params;
  const [product, brands, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { variants: { orderBy: { fullName: "asc" }, include: { source: true, prices: { include: { pharmacy: { select: { code: true } } } }, _count: { select: { inventories: true } } } } },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }] }),
  ]);
  if (!product) notFound();
  const write = can(user, "catalog.write");
  const STATUS_RU = { DRAFT: "Черновик", PUBLISHED: "Опубликован", ARCHIVED: "Архив" } as const;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={product.name}
        description={<>Изменён {formatDateTime(product.updatedAt)} · <Link className="text-brand-700 hover:underline" href={`/product/${product.slug}`} target="_blank">страница на сайте</Link></>}
        actions={<StatusPill status={product.publicationStatus} label={STATUS_RU[product.publicationStatus]} />}
      />
      {write ? (
        <div className="flex flex-wrap gap-2">
          {product.publicationStatus !== "PUBLISHED" ? <AdminForm action={setProductStatus.bind(null, product.id, "PUBLISHED")} submitLabel="Опубликовать" inline /> : <AdminForm action={setProductStatus.bind(null, product.id, "DRAFT")} submitLabel="Снять с публикации" submitVariant="outline" inline />}
          {product.publicationStatus !== "ARCHIVED" ? <AdminForm action={setProductStatus.bind(null, product.id, "ARCHIVED")} submitLabel="В архив" submitVariant="ghost" inline confirm="Убрать товар в архив? Он исчезнет с сайта." /> : null}
          <AdminForm action={toggleFeatured.bind(null, product.id)} submitLabel={product.featuredAt ? "Убрать из подборки на главной" : "Добавить в подборку на главной"} submitVariant="secondary" inline />
        </div>
      ) : null}
      <Card title="Карточка товара">
        {write ? (
          <AdminForm action={updateProduct.bind(null, product.id)}>
            <ProductFields product={product} brands={brands} categories={categories} />
          </AdminForm>
        ) : (
          <p className="text-sm text-muted">Просмотр. Для изменения нужна роль менеджера каталога.</p>
        )}
      </Card>
      <Card title={`Варианты (SKU): ${product.variants.length}`}>
        <ul className="flex flex-col gap-3">
          {product.variants.map((v) => (
            <li key={v.id}>
              <details className="rounded-[var(--radius-md)] border border-line">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="font-semibold">{v.fullName}{!v.isActive ? <span className="ml-2 text-xs text-accent-600">неактивен</span> : null}</span>
                  <span className="text-xs text-muted">
                    {v.source?.isDemo ? "ДЕМО · " : ""}{v.salamatSku ?? "без артикула"} · цен: {v.prices.length} · остатков: {v._count.inventories}
                    {v.prices.length ? ` · ${formatKzt(Math.min(...v.prices.map((p) => p.priceKzt)))}–${formatKzt(Math.max(...v.prices.map((p) => p.priceKzt)))}` : ""}
                  </span>
                </summary>
                <div className="border-t border-line p-4">
                  {write ? (
                    <AdminForm action={saveVariant.bind(null, product.id, v.id)}>
                      <VariantFields v={v} />
                    </AdminForm>
                  ) : (
                    <VariantFields v={v} />
                  )}
                  <p className="mt-3 text-xs text-muted">Источник: {v.source?.name ?? "—"} · проверено: {v.lastVerifiedAt ? formatDateTime(v.lastVerifiedAt) : "—"} · <Link className="text-brand-700 hover:underline" href={`/admin/inventory?q=${encodeURIComponent(v.salamatSku ?? v.fullName)}`}>цены и остатки</Link></p>
                </div>
              </details>
            </li>
          ))}
        </ul>
        {write ? (
          <details className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line-strong">
            <summary className="cursor-pointer px-4 py-3 font-semibold text-brand-700">+ Добавить вариант</summary>
            <div className="border-t border-line p-4">
              <AdminForm action={saveVariant.bind(null, product.id, null)} submitLabel="Добавить" resetOnSuccess>
                <VariantFields />
              </AdminForm>
            </div>
          </details>
        ) : null}
      </Card>
    </div>
  );
}
