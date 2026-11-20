import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { formatDate, formatPhone, telHref } from "@/lib/format";
import { WEEKDAYS } from "@/lib/hours";
import { getPharmacyBySlug, getSelectedPharmacy, routeLinks } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { getStorefrontState } from "@/server/storefront";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, Notice } from "@/components/ui/Feedback";
import { SelectPharmacyButton } from "@/components/catalog/SelectPharmacyButton";
import { Icon } from "@/components/icons";
import { PharmacyGallery } from "@/components/pharmacy/PharmacyGallery";
import { PharmacyMap } from "@/components/pharmacy/PharmacyMap";

export async function generateMetadata({ params }: PageProps<"/[locale]/pharmacies/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const p = await getPharmacyBySlug(slug, locale);
  if (!p) return {};
  const t = getDictionary(locale);
  return pageMetadata(locale, `/pharmacies/${p.slug}`, `${t.meta.siteName}: ${p.address}`, `${p.city}, ${p.address}. ${p.phones.map(formatPhone).join(", ")}`);
}

export default async function PharmacyPage({ params }: PageProps<"/[locale]/pharmacies/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [p, selected, store] = await Promise.all([getPharmacyBySlug(slug, locale), getSelectedPharmacy(locale), getStorefrontState()]);
  if (!p) notFound();
  const routes = routeLinks(p);
  const days = t.pharmacy.weekdays.split(",");
  const hasCoords = p.latitude !== null && p.longitude !== null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Pharmacy",
    name: `${t.meta.siteName} — ${p.address}`,
    address: { "@type": "PostalAddress", streetAddress: p.addressRu, addressLocality: p.cityRu, addressCountry: "KZ" },
    telephone: p.phones,
    ...(hasCoords ? { geo: { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude } } : {}),
  };
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs
        items={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.common.pharmacies, href: localizedPath(locale, "/pharmacies") }, { label: p.address }]}
        label={t.common.breadcrumbs}
        baseUrl={env.appUrl}
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* Photos only when SALAMAT has confirmed the right to publish them; otherwise no photo block at all. */}
          {p.photos.length ? <PharmacyGallery photos={p.photos} address={p.address} aspect="aspect-[4/3] sm:aspect-[16/10]" className="overflow-hidden rounded-[var(--radius-2xl)] border border-line [&>figcaption]:px-3 [&>figcaption]:pb-2" /> : null}
          <div>
            <p className="text-sm font-semibold text-brand-700">{t.meta.siteName} · {p.city}</p>
            <h1 className="mt-1 text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.1rem]">{p.address}</h1>
            {p.openStatus ? (
              <div className="mt-3">
                <Badge tone={p.openStatus.open ? "success" : "neutral"} icon="clock">
                  {p.openStatus.open ? t.pharmacy.openNow : t.pharmacy.closedNow}
                  {p.openStatus.open && p.openStatus.closesAt ? ` · ${fmt(t.pharmacy.closesAt, { time: p.openStatus.closesAt })}` : ""}
                  {!p.openStatus.open && p.openStatus.opensAt ? ` · ${fmt(t.pharmacy.opensAt, { time: p.openStatus.opensAt })}` : ""}
                </Badge>
              </div>
            ) : null}
          </div>
          {store.orderingEnabled && !p.acceptsOrders ? <Notice tone="warning">{t.pharmacy.notAcceptingOrders}</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <SelectPharmacyButton id={p.id} selected={selected?.id === p.id} />
            <a href={routes.route} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong px-4 font-semibold hover:border-brand-600">
              <Icon name="route" size={18} />
              {t.pharmacy.buildRoute}
              <span className="sr-only"> — {t.pharmacy.routeYandex}</span>
            </a>
            <a href={routes.place} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-line-strong px-4 font-semibold hover:border-brand-600">
              <Icon name="external" size={18} />
              {t.pharmacy.openInYandex}
            </a>
          </div>
          <section aria-labelledby="ph-phones" className="rounded-[var(--radius-xl)] border border-line p-5">
            <h2 id="ph-phones" className="mb-3 font-semibold">{t.pharmacy.phone}</h2>
            {!p.phones.length ? <p className="text-muted">{t.pharmacy.phoneUnknown}</p> : null}
            <ul className="flex flex-col gap-2">
              {p.phones.map((ph) => (
                <li key={ph}>
                  <a href={telHref(ph)} className="inline-flex items-center gap-2 text-lg font-semibold text-ink hover:text-brand-700">
                    <Icon name="phone" size={20} className="text-brand-600" />
                    {formatPhone(ph)}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="ph-hours" className="rounded-[var(--radius-xl)] border border-line p-5">
            <h2 id="ph-hours" className="mb-3 font-semibold">{t.pharmacy.hours}</h2>
            {p.hours ? (
              <dl className="grid grid-cols-[4rem_1fr] gap-y-1.5 text-[0.95rem]">
                {WEEKDAYS.map((d, i) => (
                  <div key={d} className="contents">
                    <dt className="text-muted">{days[i]}</dt>
                    <dd className="font-medium">{p.hours?.[d]?.length ? p.hours[d]!.join(", ") : t.pharmacy.dayOff}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-muted">{t.pharmacy.hoursUnknown}</p>
            )}
            {p.hoursNote ? <p className="mt-2 text-sm text-muted">{p.hoursNote}</p> : null}
          </section>
          <p className="text-sm text-muted">{p.verifiedAt ? fmt(t.pharmacy.dataVerified, { date: formatDate(p.verifiedAt, locale) }) : t.pharmacy.dataNeedsCheck}</p>
        </div>
        <div>
          {hasCoords ? (
            <PharmacyMap
              locate={false}
              openFirst
              selectedId={selected?.id ?? null}
              pharmacies={[{ id: p.id, address: p.address, city: p.city, phones: p.phones, lat: p.latitude!, lng: p.longitude!, href: localizedPath(locale, `/pharmacies/${p.slug}`) }]}
            />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] border border-dashed border-line-strong bg-surface p-6 text-center text-muted">
              <Icon name="pin" size={36} className="text-brand-300" />
              <p className="max-w-xs">{t.pharmacy.mapUnavailable}</p>
            </div>
          )}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
