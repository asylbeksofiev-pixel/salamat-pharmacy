import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { getPharmacies, getSelectedPharmacy, routeLinks } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Notice, EmptyState } from "@/components/ui/Feedback";
import { PharmacyCard } from "@/components/catalog/Tiles";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/pharmacies">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const sp = await searchParams;
  return pageMetadata(locale, "/pharmacies", t.meta.pharmaciesTitle, t.meta.pharmaciesDescription, { noindex: !!sp.q });
}

export default async function PharmaciesPage({ params, searchParams }: PageProps<"/[locale]/pharmacies">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const [all, selected] = await Promise.all([getPharmacies(locale), getSelectedPharmacy(locale)]);
  const needle = q.toLowerCase().replace(/ё/g, "е");
  const list = needle ? all.filter((p) => `${p.address} ${p.addressRu}`.toLowerCase().replace(/ё/g, "е").includes(needle)) : all;
  const anyCoords = all.some((p) => p.latitude !== null);
  const anyUnverified = all.some((p) => !p.verifiedAt);
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs items={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.common.pharmacies }]} label={t.common.breadcrumbs} baseUrl={env.appUrl} />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight sm:text-[2.1rem]">{t.pharmacy.title}</h1>
          <p className="mt-1 text-muted">{t.pharmacy.intro}</p>
        </div>
        <form method="get" className="flex w-full max-w-md gap-2" role="search">
          <label htmlFor="ph-q" className="sr-only">{t.pharmacy.searchLabel}</label>
          <div className="relative flex-1">
            <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input id="ph-q" name="q" type="search" defaultValue={q} maxLength={80} placeholder={t.pharmacy.searchPlaceholder} className="h-12 w-full rounded-[var(--radius-md)] border border-line-strong pr-3 pl-10" />
          </div>
          <button type="submit" className="h-12 rounded-[var(--radius-md)] bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700">{t.header.searchSubmit}</button>
        </form>
      </div>
      <p className="mt-4 text-sm text-muted">{fmt(t.pharmacy.count, { count: list.length })}</p>
      <div className="mt-4 flex flex-col gap-3">
        {!anyCoords ? <Notice tone="info" icon="pin">{t.pharmacy.mapUnavailable}</Notice> : null}
        {anyUnverified ? <Notice tone="warning">{t.pharmacy.dataNeedsCheck}</Notice> : null}
      </div>
      {list.length ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id}>
              <PharmacyCard p={p} t={t} locale={locale} selected={selected?.id === p.id} routes={routeLinks(p)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState className="mt-6" icon="pin" title={t.pharmacy.notFound} />
      )}
    </div>
  );
}
