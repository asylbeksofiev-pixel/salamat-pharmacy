import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getDictionary, isLocale, localizedPath, pickLocalized } from "@/lib/i18n";
import { formatKzt, formatPhone, telHref } from "@/lib/format";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ORDER_COOKIE_PREFIX } from "@/server/orders/constants";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Feedback";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]/order/success/[publicId]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).meta.orderSuccessTitle, robots: { index: false, follow: false } };
}

export default async function OrderSuccessPage({ params }: PageProps<"/[locale]/order/success/[publicId]">) {
  const { locale, publicId } = await params;
  if (!isLocale(locale) || !/^S-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(publicId)) notFound();
  const t = getDictionary(locale);
  const order = await prisma.order.findUnique({
    where: { publicId },
    include: { pharmacy: { select: { addressRu: true, addressKk: true, phones: true } }, items: { orderBy: { id: "asc" } } },
  });
  if (!order) notFound();
  // Details are shown only in the browser that submitted the request (cookie set by /api/orders).
  const jar = await cookies();
  const owner = jar.has(`${ORDER_COOKIE_PREFIX}${publicId}`);
  const settings = await getSettings();
  const phone = order.pharmacy.phones[0] ?? settings.helpline.phone;
  return (
    <div className="container-page max-w-3xl py-10">
      <div className="flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Icon name="checkCircle" size={36} />
        </span>
        <h1 className="mt-4 text-[1.9rem] font-bold tracking-tight">{t.order.successTitle}</h1>
        <p className="mt-2 text-muted">{t.order.number}</p>
        <p className="mt-1 rounded-[var(--radius-md)] bg-surface px-4 py-2 font-mono text-2xl font-bold tracking-wider text-ink">{order.publicId}</p>
        <p className="mt-4 max-w-xl text-ink-soft">{t.order.successText}</p>
      </div>
      <Notice tone="warning" className="mt-6">{t.order.notReadyYet}</Notice>
      {owner ? (
        <div className="mt-6 rounded-[var(--radius-xl)] border border-line bg-white p-5">
          <dl className="grid gap-3 text-[0.95rem] sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted">{t.order.status}</dt>
            <dd className="font-semibold">{t.order.statuses[order.status]}</dd>
            <dt className="text-muted">{t.order.pharmacy}</dt>
            <dd className="font-semibold">{pickLocalized(locale, order.pharmacy.addressRu, order.pharmacy.addressKk)}</dd>
            <dt className="text-muted">{t.order.method}</dt>
            <dd>{order.fulfillment === "PICKUP" ? t.checkout.pickup : t.checkout.delivery}</dd>
          </dl>
          <h2 className="mt-5 mb-2 font-semibold">{t.order.items}</h2>
          <ul className="divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-2.5 text-[0.95rem]">
                <span className="min-w-0">
                  <span className="break-words">{i.nameSnapshot} × {i.quantity}</span>
                  {!i.variantId && i.skuSnapshot && !i.skuSnapshot.startsWith("#") ? (
                    <span className="block text-xs text-muted">
                      {t.items.article}: <span className="font-mono">{i.skuSnapshot}</span>
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right font-semibold">{i.lineTotalKzt !== null ? formatKzt(i.lineTotalKzt, locale) : <span className="font-normal text-muted">{t.request.priceByPharmacy}</span>}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between gap-4 border-t border-line pt-3">
            <span className="text-ink-soft">{order.hasUnpricedItems ? t.order.totalPending : t.order.totalConfirmed}</span>
            {order.totalKzt ? <span className="text-xl font-bold">{formatKzt(order.totalKzt, locale)}</span> : null}
          </div>
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href={localizedPath(locale, "/catalog")}>{t.order.backToCatalog}</ButtonLink>
        <a href={telHref(phone)} className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong px-4 font-semibold hover:border-brand-600">
          <Icon name="phone" size={18} />
          {formatPhone(phone)}
        </a>
      </div>
    </div>
  );
}
