import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { formatDate, formatKzt } from "@/lib/format";
import { getPromotion, promotionItems } from "@/server/promotions";
import { getSelectedPharmacy } from "@/server/pharmacies";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, Notice } from "@/components/ui/Feedback";
import { ProductGrid } from "@/components/catalog/ProductCard";

export async function generateMetadata({ params }: PageProps<"/[locale]/promotions/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const p = await getPromotion(slug, locale);
  if (!p) return {};
  return pageMetadata(locale, `/promotions/${p.slug}`, p.title, p.description, { noindex: p.state !== "active" });
}

export default async function PromotionPage({ params }: PageProps<"/[locale]/promotions/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const p = await getPromotion(slug, locale);
  if (!p) notFound();
  const pharmacy = await getSelectedPharmacy(locale);
  const items = p.state === "active" ? await promotionItems(p, locale, pharmacy?.id ?? null) : [];
  const value = p.benefitValue ? (p.benefitUnit === "PERCENT" ? `${p.benefitValue}%` : formatKzt(p.benefitValue, locale)) : null;
  const typeLabel = p.type === "DISCOUNT" ? t.promotions.typeDISCOUNT : p.type === "BONUS" ? t.promotions.typeBONUS : t.promotions.typeOTHER;
  return (
    <div className="container-page py-6 md:py-8">
      <Breadcrumbs
        items={[{ label: t.common.home, href: localizedPath(locale, "/") }, { label: t.promotions.title, href: localizedPath(locale, "/promotions") }, { label: p.title }]}
        label={t.common.breadcrumbs}
        baseUrl={env.appUrl}
      />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={p.type === "BONUS" ? "info" : "accent"} icon={p.type === "BONUS" ? "gift" : "tag"}>
              {typeLabel}
              {value ? ` ${p.type === "DISCOUNT" ? "−" : ""}${value}` : ""}
            </Badge>
            {p.state === "ended" ? <Badge tone="neutral">{t.promotions.ended}</Badge> : null}
            {p.state === "upcoming" ? <Badge tone="warning">{t.promotions.notStarted}</Badge> : null}
          </div>
          <h1 className="mt-3 text-[1.75rem] leading-tight font-bold tracking-tight sm:text-[2.25rem]">{p.title}</h1>
          {p.state === "ended" ? <Notice tone="warning" className="mt-4">{t.promotions.ended}</Notice> : null}
          {p.description ? <p className="prose-salamat mt-4 whitespace-pre-line">{p.description}</p> : null}
          {p.type === "BONUS" ? <Notice tone="info" className="mt-4">{t.promotions.bonusNote}</Notice> : null}
          {p.terms ? (
            <section className="mt-6">
              <h2 className="mb-2 text-lg font-semibold">{t.promotions.terms}</h2>
              <p className="prose-salamat whitespace-pre-line">{p.terms}</p>
            </section>
          ) : null}
        </article>
        <aside className="flex flex-col gap-4 self-start rounded-[var(--radius-xl)] border border-line p-5 text-sm">
          <div>
            <h2 className="font-semibold">{t.promotions.period}</h2>
            <p className="mt-1 text-ink-soft">
              {fmt(t.promotions.fromDate, { date: formatDate(p.startsAt, locale) })} {p.endsAt ? fmt(t.promotions.until, { date: formatDate(p.endsAt, locale) }) : `· ${t.promotions.noEnd}`}
            </p>
          </div>
          <div>
            <h2 className="font-semibold">{t.promotions.pharmacies}</h2>
            {p.appliesToAllPharmacies ? (
              <p className="mt-1 text-ink-soft">{t.promotions.allPharmacies}</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {p.pharmacies.map((ph) => (
                  <li key={ph.slug}><Link className="text-brand-700 hover:underline" href={localizedPath(locale, `/pharmacies/${ph.slug}`)}>{ph.address}</Link></li>
                ))}
              </ul>
            )}
          </div>
          {p.categories.length ? (
            <div>
              <h2 className="font-semibold">{t.promotions.categories}</h2>
              <ul className="mt-1 flex flex-wrap gap-2">
                {p.categories.map((c) => (
                  <li key={c.slug}><Link className="text-brand-700 hover:underline" href={localizedPath(locale, `/catalog/${c.slug}`)}>{c.name}</Link></li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
      {items.length ? (
        <section className="mt-10">
          <h2 className="mb-5 text-2xl font-bold">{t.promotions.products}</h2>
          <ProductGrid items={items} t={t} locale={locale} pharmacyPhone={pharmacy?.phones[0]} />
        </section>
      ) : null}
    </div>
  );
}
