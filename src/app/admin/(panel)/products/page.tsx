import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { AdminPagination, PageHeader, StatusPill, Table, Td, inputCls } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "Товары" };
const PAGE = 40;
const STATUS_RU = { DRAFT: "Черновик", PUBLISHED: "Опубликован", ARCHIVED: "Архив" } as const;

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requireStaffPage("catalog.read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = sp.status === "DRAFT" || sp.status === "PUBLISHED" || sp.status === "ARCHIVED" ? sp.status : undefined;
  const categoryId = typeof sp.category === "string" && sp.category ? sp.category : undefined;
  const noprice = sp.noprice === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.ProductWhereInput = {
    ...(status ? { publicationStatus: status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { variants: { some: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { salamatSku: { contains: q } }, { barcode: { contains: q } }, { externalId: { contains: q } }] } } }] }
      : {}),
    ...(noprice ? { publicationStatus: "PUBLISHED", variants: { some: { isActive: true, prices: { none: {} } } } } : {}),
  };
  const [products, total, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: PAGE,
      skip: (page - 1) * PAGE,
      include: { brand: true, category: true, variants: { select: { id: true, source: { select: { name: true, isDemo: true } }, _count: { select: { prices: true } } } } },
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }], select: { id: true, nameRu: true, parentId: true } }),
  ]);
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (categoryId) u.set("category", categoryId);
    if (noprice) u.set("noprice", "1");
    if (p > 1) u.set("page", String(p));
    return `/admin/products${u.toString() ? `?${u}` : ""}`;
  };
  return (
    <div>
      <PageHeader title="Товары" description={`Найдено: ${total}. Цены и остатки хранятся по SKU и аптекам — раздел «Цены и остатки».`} actions={can(user, "catalog.write") ? <ButtonLink href="/admin/products/new" icon="plus">Новый товар</ButtonLink> : null} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">Поиск<input name="q" defaultValue={q} placeholder="Название, артикул, штрихкод" className={`${inputCls} min-w-64`} /></label>
        <label className="flex flex-col gap-1 text-sm">Статус
          <select name="status" defaultValue={status ?? ""} className={inputCls}><option value="">Все</option><option value="DRAFT">Черновики</option><option value="PUBLISHED">Опубликованные</option><option value="ARCHIVED">Архив</option></select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Категория
          <select name="category" defaultValue={categoryId ?? ""} className={`${inputCls} max-w-64`}><option value="">Все</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.nameRu}</option>)}</select>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="noprice" value="1" defaultChecked={noprice} className="size-4 accent-brand-600" /> без цен</label>
        <button className="h-10 rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white">Найти</button>
      </form>
      <Table head={["Товар", "Бренд", "Категория", "SKU", "Цены", "Источник", "Статус", "Изменён"]} empty={products.length ? undefined : "Товаров нет. Загрузите ассортимент через «Импорт»."}>
        {products.map((p) => (
          <tr key={p.id} className="hover:bg-surface/60">
            <Td><Link href={`/admin/products/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.name}</Link>{p.featuredAt ? <span className="ml-2 rounded bg-brand-50 px-1.5 text-xs text-brand-800">подборка</span> : null}</Td>
            <Td>{p.brand?.name ?? "—"}</Td>
            <Td>{p.category?.nameRu ?? "—"}</Td>
            <Td>{p.variants.length}</Td>
            <Td>{p.variants.filter((v) => v._count.prices > 0).length}/{p.variants.length}</Td>
            <Td className="text-xs">{Array.from(new Set(p.variants.map((v) => (v.source?.isDemo ? "ДЕМО" : (v.source?.name ?? "вручную"))))).join(", ")}</Td>
            <Td><StatusPill status={p.publicationStatus} label={STATUS_RU[p.publicationStatus]} /></Td>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(p.updatedAt)}</Td>
          </tr>
        ))}
      </Table>
      <AdminPagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={qs} />
    </div>
  );
}
