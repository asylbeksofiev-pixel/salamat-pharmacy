import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { can, canAccessPharmacy } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { ORDER_STATUS_LABELS_RU, ORDER_TRANSITIONS } from "@/lib/order-status";
import { formatDateTime, formatKzt, formatPhone, telHref } from "@/lib/format";
import { AdminForm } from "@/components/admin/AdminForm";
import { AdminLink, Card, PageHeader, StatusPill, Table, Td, TextArea, SelectField } from "@/components/admin/ui";
import { Notice } from "@/components/ui/Feedback";
import { addOrderNote, changeOrderStatus } from "../actions";

export const metadata = { title: "Заявка" };

const STOCK_RU: Record<string, string> = { IN_STOCK: "было в наличии", LOW_STOCK: "оставалось мало", ON_REQUEST: "под заказ", OUT_OF_STOCK: "не было", UNKNOWN: "не подтверждено" };

export default async function OrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const user = await requireStaffPage("orders.read");
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      pharmacy: true,
      items: { include: { variant: { select: { product: { select: { slug: true } }, slug: true } } } },
      events: { orderBy: { createdAt: "asc" }, include: { adminUser: { select: { name: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { adminUser: { select: { name: true } } } },
    },
  });
  if (!order || !canAccessPharmacy(user, "orders.read", order.pharmacyId)) notFound();
  const showContacts = can(user, "orders.contacts");
  const canWrite = can(user, "orders.write");
  const next = ORDER_TRANSITIONS[order.status];
  return (
    <div>
      <PageHeader title={`Заявка ${order.publicId}`} description={`Создана ${formatDateTime(order.createdAt)} · ${order.locale === "kk" ? "казахская версия сайта" : "русская версия сайта"}`} actions={<StatusPill status={order.status} label={ORDER_STATUS_LABELS_RU[order.status]} />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-5">
          {order.status === "NEW" ? <Notice tone="warning">Новая заявка: проверьте наличие и цену в аптеке и позвоните покупателю. До подтверждения покупатель видит «Заявка отправлена, оператор подтвердит детали».</Notice> : null}
          {order.hasUnpricedItems && order.totalKzt === null ? <Notice tone="info">Заявка на уточнение: у товаров нет подтверждённых цен на сайте. Назовите покупателю цену и наличие по телефону.</Notice> : null}
          <Card title="Состав">
            <Table head={["Товар (снимок на момент заявки)", "Кол-во", "Цена", "Сумма", "Наличие при заявке", "Рецепт"]}>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <Td>
                    {i.variant ? <AdminLink href={`/product/${i.variant.product.slug}?sku=${i.variant.slug}`}>{i.nameSnapshot}</AdminLink> : i.nameSnapshot}
                    {/* Catalogue products (no SKU record) keep the SALAMAT article in skuSnapshot. */}
                    {!i.variantId && i.skuSnapshot ? <span className="block text-xs text-muted">{i.skuSnapshot.startsWith("#") ? "ID в каталоге" : "Артикул"}: <span className="font-mono">{i.skuSnapshot.replace(/^#/, "")}</span></span> : null}
                  </Td>
                  <Td>{i.quantity}</Td>
                  <Td className="whitespace-nowrap">{i.unitPriceKzt !== null ? formatKzt(i.unitPriceKzt) : <span className="text-warn-700">уточнить</span>}</Td>
                  <Td className="whitespace-nowrap">{i.lineTotalKzt !== null ? formatKzt(i.lineTotalKzt) : "—"}</Td>
                  <Td>{STOCK_RU[i.stockStatusSnapshot]}</Td>
                  <Td>{i.prescriptionSnapshot === "PRESCRIPTION" ? <span className="font-semibold text-accent-700">по рецепту</span> : i.prescriptionSnapshot === "UNKNOWN" ? "не подтверждён" : "без рецепта"}</Td>
                </tr>
              ))}
            </Table>
            <p className="mt-3 text-right">Итого по подтверждённым ценам: <b>{order.totalKzt ? formatKzt(order.totalKzt) : "—"}</b>{order.hasUnpricedItems ? <span className="block text-sm text-warn-700">Есть позиции, цену которых нужно сообщить покупателю.</span> : null}</p>
          </Card>
          <Card title="История статусов">
            <ol className="flex flex-col gap-2 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted">{formatDateTime(e.createdAt)}</span>
                  <span className="font-medium">{e.fromStatus ? `${ORDER_STATUS_LABELS_RU[e.fromStatus]} → ` : ""}{ORDER_STATUS_LABELS_RU[e.toStatus]}</span>
                  <span className="text-muted">{e.adminUser?.name ?? "сайт"}</span>
                  {e.note ? <span className="w-full text-ink-soft">«{e.note}»</span> : null}
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Служебные заметки">
            {canWrite ? (
              <AdminForm action={addOrderNote.bind(null, order.id)} submitLabel="Добавить заметку" resetOnSuccess>
                <TextArea label="Заметка (видна только сотрудникам)" name="body" rows={2} />
              </AdminForm>
            ) : null}
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {order.notes.map((n) => (
                <li key={n.id} className="rounded-[var(--radius-md)] bg-surface p-3">
                  <p className="text-xs text-muted">{formatDateTime(n.createdAt)} · {n.adminUser?.name ?? "—"}</p>
                  <p className="mt-1 whitespace-pre-line">{n.body}</p>
                </li>
              ))}
              {!order.notes.length ? <li className="text-muted">Заметок нет</li> : null}
            </ul>
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Покупатель">
            {showContacts ? (
              order.anonymizedAt ? <p className="text-sm text-muted">Контактные данные обезличены {formatDateTime(order.anonymizedAt)} по сроку хранения.</p> : (
                <dl className="grid gap-2 text-sm">
                  <dt className="text-muted">Имя</dt><dd className="font-semibold">{order.customerName}</dd>
                  <dt className="text-muted">Телефон</dt><dd><a className="font-semibold text-brand-700 hover:underline" href={telHref(order.customerPhone)}>{formatPhone(order.customerPhone)}</a></dd>
                  {order.customerComment ? <><dt className="text-muted">Комментарий</dt><dd className="whitespace-pre-line">{order.customerComment}</dd></> : null}
                  {order.deliveryAddress ? <><dt className="text-muted">Адрес доставки</dt><dd>{order.deliveryAddress}</dd></> : null}
                  <dt className="text-muted">Согласие на обработку ПДн</dt><dd>{formatDateTime(order.consentAt)} · {order.consentVersion}</dd>
                </dl>
              )
            ) : (
              <p className="text-sm text-muted">Контактные данные доступны только операторам.</p>
            )}
          </Card>
          <Card title="Получение">
            <p className="text-sm"><b>{order.fulfillment === "PICKUP" ? "Самовывоз" : "Доставка"}</b> — {order.pharmacy.addressRu}</p>
            <p className="mt-1 text-sm text-muted">Телефон аптеки: {order.pharmacy.phones.map(formatPhone).join(", ")}</p>
            <p className="mt-2 text-xs text-muted">Уведомление: {order.notifiedAt ? `отправлено ${formatDateTime(order.notifiedAt)}` : (order.notifyError ?? "—")}</p>
          </Card>
          {canWrite && next.length ? (
            <Card title="Изменить статус">
              <AdminForm action={changeOrderStatus.bind(null, order.id)} submitLabel="Применить">
                <SelectField label="Новый статус" name="status" options={next.map((s) => ({ value: s, label: ORDER_STATUS_LABELS_RU[s] }))} />
                <TextArea label="Комментарий к смене статуса" name="note" rows={2} />
              </AdminForm>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
