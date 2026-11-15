import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { formatDate, formatPhone, telHref } from "@/lib/format";
import type { PharmacyView } from "@/server/pharmacies";
import type { PromotionView } from "@/server/promotions";
import { Icon, isIconName } from "../icons";
import { Badge } from "../ui/Feedback";
import { SelectPharmacyButton } from "./SelectPharmacyButton";

export function CategoryTile({ slug, name, iconKey, locale, count }: { slug: string; name: string; iconKey: string | null; locale: Locale; count?: number }) {
  return (
    <Link
      href={localizedPath(locale, `/catalog/${slug}`)}
      className="group flex h-full items-center gap-4 rounded-[var(--radius-xl)] border border-line bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-card)] sm:p-5"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-lg)] bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white">
        <Icon name={isIconName(iconKey) ? iconKey : "box"} size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-snug font-semibold text-ink">{name}</span>
        {count !== undefined ? <span className="text-sm text-muted">{count}</span> : null}
      </span>
      <Icon name="chevronRight" size={18} className="shrink-0 text-line-strong transition-colors group-hover:text-brand-600" />
    </Link>
  );
}

export function PharmacyCard({ p, t, locale, selected, routes }: { p: PharmacyView; t: Dictionary; locale: Locale; selected: boolean; routes: { twoGis: string; yandex: string } }) {
  return (
    <article className={`flex h-full flex-col gap-3 rounded-[var(--radius-xl)] border bg-white p-4 sm:p-5 ${selected ? "border-brand-600 ring-1 ring-brand-600" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="leading-snug font-semibold text-ink">
          <Link href={localizedPath(locale, `/pharmacies/${p.slug}`)} className="hover:text-brand-700 hover:underline">
            {p.address}
          </Link>
        </h3>
        {p.openStatus ? (
          <Badge tone={p.openStatus.open ? "success" : "neutral"} icon="clock">
            {p.openStatus.open ? t.pharmacy.openNow : t.pharmacy.closedNow}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm text-muted">{p.city}</p>
      <ul className="flex flex-col gap-1 text-sm">
        {p.phones.map((ph) => (
          <li key={ph}>
            <a href={telHref(ph)} className="inline-flex items-center gap-2 font-medium text-ink-soft hover:text-brand-700">
              <Icon name="phone" size={16} className="text-brand-600" />
              {formatPhone(ph)}
            </a>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Icon name="clock" size={16} />
        {p.hours ? (p.openStatus?.open && p.openStatus.closesAt ? fmt(t.pharmacy.closesAt, { time: p.openStatus.closesAt }) : p.openStatus?.opensAt ? fmt(t.pharmacy.opensAt, { time: p.openStatus.opensAt }) : t.pharmacy.hours) : t.pharmacy.hoursUnknown}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <SelectPharmacyButton id={p.id} selected={selected} />
        <a href={routes.twoGis} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <Icon name="route" size={18} />
          {t.pharmacy.route}
          <span className="sr-only"> — {t.pharmacy.route2gis}</span>
        </a>
      </div>
    </article>
  );
}

export function PromotionCard({ p, t, locale }: { p: PromotionView; t: Dictionary; locale: Locale }) {
  const typeLabel = p.type === "DISCOUNT" ? t.promotions.typeDISCOUNT : p.type === "BONUS" ? t.promotions.typeBONUS : t.promotions.typeOTHER;
  return (
    <Link href={localizedPath(locale, `/promotions/${p.slug}`)} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-white transition-shadow hover:shadow-[var(--shadow-card)]">
      <div className="relative flex aspect-[16/7] items-end bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- promotion images are uploaded by staff from allowed sources
          <img src={p.imageUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          <svg className="absolute -right-6 -bottom-10 h-48 w-48 opacity-15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
          </svg>
        )}
        <span className="relative rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-brand-800">{typeLabel}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="text-lg leading-snug font-semibold text-ink group-hover:text-brand-700">{p.title}</h3>
        {p.description ? <p className="line-clamp-2 text-sm text-muted">{p.description}</p> : null}
        <p className="mt-auto pt-2 text-sm font-medium text-ink-soft">
          {p.endsAt ? fmt(t.promotions.until, { date: formatDate(p.endsAt, locale) }) : t.promotions.noEnd}
        </p>
      </div>
    </Link>
  );
}
