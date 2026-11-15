import type { Prisma } from "@prisma/client";
import { requireStaffPage } from "@/server/auth/session";
import { canAccessPharmacy } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { formatDateTime } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminPagination, PageHeader, inputCls } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { saveOffer } from "./actions";
import { hoursAgo } from "@/server/time";

export const metadata = { title: "Цены и остатки" };
const PAGE = 40;
const STOCK = [
  { value: "", label: "не указан" },
  { value: "IN_STOCK", label: "есть" },
  { value: "LOW_STOCK", label: "мало" },
  { value: "OUT_OF_STOCK", label: "нет" },
  { value: "ON_REQUEST", label: "под заказ" },
];

export default async function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  const user = await requireStaffPage("prices.read");
  const sp = await searchParams;
  const settings = await getSettings();
  const pharmacies = await prisma.pharmacy.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true, addressRu: true } });
  const writable = pharmacies.filter((p) => canAccessPharmacy(user, "prices.write", p.id));
  const defaultPharmacy = writable[0] ?? pharmacies[0];
  const pharmacyId = typeof sp.pharmacy === "string" && pharmacies.some((p) => p.id === sp.pharmacy) ? sp.pharmacy : defaultPharmacy?.id;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const stale = sp.stale === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const canWrite = !!pharmacyId && canAccessPharmacy(user, "prices.write", pharmacyId);
  const staleSince = hoursAgo(settings.offerPolicy.stockStaleHours);
  const where: Prisma.ProductVariantWhereInput = {
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { salamatSku: { contains: q } }, { barcode: { contains: q } }] } : {}),
    ...(stale && pharmacyId ? { inventories: { some: { pharmacyId, sourceUpdatedAt: { lt: staleSince } } } } : {}),
  };
  const [variants, total] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      orderBy: { fullName: "asc" },
      take: PAGE,
      skip: (page - 1) * PAGE,
      include: { prices: { where: { pharmacyId } }, inventories: { where: { pharmacyId } }, product: { select: { publicationStatus: true } } },
    }),
    prisma.productVariant.count({ where }),
  ]);
  const qs = (p: number) => `/admin/inventory?${new URLSearchParams({ ...(pharmacyId ? { pharmacy: pharmacyId } : {}), ...(q ? { q } : {}), ...(stale ? { stale: "1" } : {}), page: String(p) })}`;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Цены и остатки" description={`Цена и остаток хранятся для пары «SKU × аптека». Устаревают через ${settings.offerPolicy.priceStaleHours} ч (цена) и ${settings.offerPolicy.stockStaleHours} ч (остаток) — после этого сайт просит подтверждение оператора.`} />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">Аптека
          <select name="pharmacy" defaultValue={pharmacyId} className={`${inputCls} min-w-72`}>
            {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.addressRu}{canAccessPharmacy(user, "prices.write", p.id) ? "" : " (просмотр)"}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Товар<input name="q" defaultValue={q} placeholder="Название, артикул, штрихкод" className={`${inputCls} min-w-60`} /></label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="stale" value="1" defaultChecked={stale} className="size-4 accent-brand-600" /> только устаревшие остатки</label>
        <button className="h-10 rounded-[var(--radius-md)] bg-brand-600 px-4 text-sm font-semibold text-white">Показать</button>
      </form>
      {!canWrite ? <Notice tone="info">Режим просмотра: изменять цены и остатки этой аптеки может её менеджер или Super Admin.</Notice> : null}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-white">
        <ul className="min-w-[56rem] divide-y divide-line">
          {variants.map((v) => {
            const price = v.prices[0];
            const inv = v.inventories[0];
            const isStale = inv && inv.sourceUpdatedAt < staleSince;
            return (
              <li key={v.id} className="grid grid-cols-[minmax(14rem,1fr)_auto] items-end gap-3 px-4 py-3">
                <div className="min-w-0 self-center">
                  <p className="font-medium">{v.fullName}</p>
                  <p className="text-xs text-muted">
                    {v.salamatSku ?? "—"} · {v.product.publicationStatus === "PUBLISHED" ? "опубликован" : "не опубликован"} · цена: {price ? formatDateTime(price.sourceUpdatedAt) : "нет"} · остаток: {inv ? formatDateTime(inv.sourceUpdatedAt) : "нет"}
                    {isStale ? <span className="ml-1 font-semibold text-warn-700">устарел</span> : null}
                  </p>
                </div>
                {pharmacyId ? (
                  <fieldset disabled={!canWrite}>
                    <AdminForm action={saveOffer.bind(null, v.id, pharmacyId)} submitLabel="Подтвердить" inline>
                      <label className="flex flex-col text-xs">Цена, ₸<input name="price" inputMode="numeric" defaultValue={price?.priceKzt ?? ""} className={`${inputCls} w-24`} /></label>
                      <label className="flex flex-col text-xs">Прежняя<input name="oldPrice" inputMode="numeric" defaultValue={price?.oldPriceKzt ?? ""} className={`${inputCls} w-24`} /></label>
                      <label className="flex flex-col text-xs">Остаток<input name="qty" inputMode="numeric" defaultValue={inv?.quantity ?? ""} className={`${inputCls} w-20`} /></label>
                      <label className="flex flex-col text-xs">Статус
                        <select name="status" defaultValue={inv?.status && inv.status !== "UNKNOWN" ? inv.status : ""} className={`${inputCls} w-28`}>{STOCK.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                      </label>
                    </AdminForm>
                  </fieldset>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!variants.length ? <p className="p-6 text-center text-sm text-muted">Ничего не найдено</p> : null}
      </div>
      <AdminPagination page={page} pageCount={Math.ceil(total / PAGE)} hrefFor={qs} />
    </div>
  );
}
