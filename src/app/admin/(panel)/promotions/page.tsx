import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader, StatusPill, Table, Td } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { PromotionForm } from "./PromotionForm";

export const metadata = { title: "Акции" };

export default async function PromotionsAdmin() {
  await requireStaffPage("promotions.write");
  const now = new Date();
  const [promos, pharmacies, categories] = await Promise.all([
    prisma.promotion.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { variants: true, categories: true, pharmacies: true } } } }),
    prisma.pharmacy.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, addressRu: true } }),
    prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }], select: { id: true, nameRu: true, parentId: true } }),
  ]);
  const state = (p: (typeof promos)[number]) => (p.status !== "PUBLISHED" ? p.status : p.startsAt > now ? "upcoming" : p.endsAt && p.endsAt <= now ? "ended" : "active");
  const STATE_RU: Record<string, string> = { DRAFT: "Черновик", ARCHIVED: "Архив", upcoming: "Запланирована", ended: "Завершена", active: "Действует" };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Акции" description="Публикуются только подтверждённые акции. Завершённые автоматически перестают показываться как действующие." />
      <Notice tone="warning">Бонусы со страницы salamat.pharmapay.kz — программа кэшбэка от производителей (загрузка чеков и накладных), а не скидки покупателям. Не переносите их сюда без подтверждения SALAMAT (docs/source-audit.md).</Notice>
      <Table head={["Акция", "Тип", "Период", "SKU / категорий / аптек", "Состояние"]} empty={promos.length ? undefined : "Акций нет"}>
        {promos.map((p) => (
          <tr key={p.id}>
            <Td><Link href={`/admin/promotions/${p.id}`} className="font-semibold text-brand-700 hover:underline">{p.titleRu}</Link></Td>
            <Td>{p.type === "BONUS" ? "Бонус" : p.type === "DISCOUNT" ? "Скидка" : "Другое"}{p.benefitValue ? ` ${p.benefitValue}${p.benefitUnit === "PERCENT" ? "%" : " ₸"}` : ""}</Td>
            <Td className="text-xs whitespace-nowrap">{formatDateTime(p.startsAt)} — {p.endsAt ? formatDateTime(p.endsAt) : "бессрочно"}</Td>
            <Td>{p._count.variants} / {p._count.categories} / {p.appliesToAllPharmacies ? "все" : p._count.pharmacies}</Td>
            <Td><StatusPill status={state(p) === "active" ? "PUBLISHED" : state(p) === "ended" ? "ARCHIVED" : state(p) === "upcoming" ? "PREVIEW" : p.status} label={STATE_RU[state(p)]} /></Td>
          </tr>
        ))}
      </Table>
      <Card title="Новая акция">
        <PromotionForm pharmacies={pharmacies} categories={categories} />
      </Card>
    </div>
  );
}
