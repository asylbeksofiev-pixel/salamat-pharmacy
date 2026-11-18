import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { fmt, localizedPath } from "@/lib/i18n/config";
import { formatDate, formatKzt, formatPhone, telHref } from "@/lib/format";
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
      {!p.phones.length ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon name="phone" size={16} />
          {t.pharmacy.phoneUnknown}
        </p>
      ) : null}
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

/** Real benefit from the promotion data ("−10 %", "−500 ₸", "500 ₸"); null when the data has none. */
function promotionBenefit(p: PromotionView, locale: Locale): string | null {
  if (p.benefitValue === null || p.benefitValue <= 0 || !p.benefitUnit) return null;
  const value = p.benefitUnit === "PERCENT" ? `${p.benefitValue.toLocaleString(locale === "kk" ? "kk-KZ" : "ru-KZ")} %` : formatKzt(p.benefitValue, locale);
  return p.type === "DISCOUNT" ? `−${value}` : value;
}

/** The promotion to give more room on the list: one with a real benefit, a photo or ending soon; otherwise the newest. */
export function featuredPromotionIndex(list: PromotionView[]): number {
  const score = (p: PromotionView) => (p.benefitValue && p.benefitUnit ? 2 : 0) + (p.imageUrl ? 2 : 0) + (p.daysLeft !== null && p.daysLeft > 0 && p.daysLeft <= 7 ? 1 : 0);
  let best = 0;
  list.forEach((p, i) => {
    if (score(p) > score(list[best])) best = i;
  });
  return best;
}

/**
 * Promotion in a list: type, benefit (only when set), title, short conditions, period, where it applies, link to terms.
 * No gradients or decorative art; a photo is shown only when staff uploaded one. `featured` gives the first item more room.
 */
export function PromotionCard({ p, t, locale, featured = false }: { p: PromotionView; t: Dictionary; locale: Locale; featured?: boolean }) {
  const typeLabel = p.type === "DISCOUNT" ? t.promotions.typeDISCOUNT : p.type === "BONUS" ? t.promotions.typeBONUS : t.promotions.typeOTHER;
  const typeTone = p.type === "DISCOUNT" ? "bg-accent-50 text-accent-700" : p.type === "BONUS" ? "bg-brand-50 text-brand-800" : "bg-surface text-ink-soft";
  const benefit = promotionBenefit(p, locale);
  const daysLeft = p.daysLeft;
  const endingSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;
  const href = localizedPath(locale, `/promotions/${p.slug}`);
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-white transition-[border-color,box-shadow] duration-200 hover:border-brand-200 hover:shadow-[var(--shadow-card)] ${featured && p.imageUrl ? "md:flex-row" : ""}`}
    >
      {p.imageUrl ? (
        <div className={`relative shrink-0 bg-surface ${featured ? "aspect-[16/9] md:aspect-auto md:w-2/5" : "aspect-[16/9]"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- promotion images are uploaded by staff from allowed sources */}
          <img src={p.imageUrl} alt="" className="absolute inset-0 size-full object-cover" loading={featured ? "eager" : "lazy"} />
        </div>
      ) : null}
      <div className={`flex flex-1 flex-col gap-2 ${featured ? "p-5 sm:p-6" : "p-4 sm:p-5"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeTone}`}>{typeLabel}</span>
          {endingSoon ? <span className="rounded-full bg-warn-50 px-2.5 py-0.5 text-xs font-semibold text-warn-700">{fmt(t.promotions.daysLeft, { count: daysLeft })}</span> : null}
        </div>
        {benefit ? <p className={`font-extrabold tracking-tight text-ink tabular-nums ${featured ? "text-3xl" : "text-2xl"}`}>{benefit}</p> : null}
        <h3 className={`leading-snug font-semibold break-words text-ink ${featured ? "text-xl sm:text-2xl" : "text-lg"}`}>
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:text-brand-700 focus-visible:outline-none">
            {p.title}
          </Link>
        </h3>
        {p.description ? <p className={`text-[0.95rem] break-words text-ink-soft ${featured ? "line-clamp-4" : "line-clamp-3"}`}>{p.description}</p> : null}
        <dl className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex items-center gap-2 text-ink-soft">
            <dt className="sr-only">{t.promotions.period}</dt>
            <Icon name="clock" size={16} className="shrink-0 text-muted" />
            <dd>{p.endsAt ? fmt(t.promotions.until, { date: formatDate(p.endsAt, locale) }) : t.promotions.noEnd}</dd>
          </div>
          {p.appliesToAllPharmacies || p.pharmacies.length ? (
            <div className="flex items-center gap-2 text-ink-soft">
              <dt className="sr-only">{t.promotions.pharmacies}</dt>
              <Icon name="store" size={16} className="shrink-0 text-muted" />
              <dd>{p.appliesToAllPharmacies ? t.promotions.allPharmacies : fmt(t.promotions.inPharmacies, { count: p.pharmacies.length })}</dd>
            </div>
          ) : null}
        </dl>
        <span className="inline-flex items-center gap-0.5 self-start text-sm font-semibold text-brand-700" aria-hidden="true">
          {t.promotions.terms}
          <Icon name="chevronRight" size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
