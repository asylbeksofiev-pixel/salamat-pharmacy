import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";
import { getCategoryTree } from "@/server/catalog";
import { getPharmacies, getSelectedPharmacy, routeLinks } from "@/server/pharmacies";
import { getActivePromotions } from "@/server/promotions";
import { featuredItems } from "@/server/products";
import { getSettings } from "@/server/settings";
import { pageMetadata } from "@/server/seo";
import { SearchBox } from "@/components/site/SearchBox";
import { CategoryTile, PharmacyCard, PromotionCard } from "@/components/catalog/Tiles";
import { ProductGrid } from "@/components/catalog/ProductCard";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return { ...pageMetadata(locale, "/", t.meta.defaultTitle, t.meta.defaultDescription), title: { absolute: t.meta.defaultTitle } };
}

function SectionTitle({ id, title, action }: { id: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 id={id} className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
        {title}
      </h2>
      {action}
    </div>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const [tree, pharmacies, selected, promotions, settings] = await Promise.all([
    getCategoryTree(locale),
    getPharmacies(locale),
    getSelectedPharmacy(locale),
    getActivePromotions(locale),
    getSettings(),
  ]);
  const featured = await featuredItems(locale, selected?.id ?? null);
  const href = (p: string) => localizedPath(locale, p);
  const shownPharmacies = selected ? [selected, ...pharmacies.filter((p) => p.id !== selected.id)].slice(0, 6) : pharmacies.slice(0, 6);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-brand-50/70 to-white">
        <div className="container-page grid items-center gap-10 py-10 md:py-16 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div className="relative z-10 flex flex-col gap-6">
            <p className="inline-flex items-center gap-2 self-start rounded-full bg-white px-3 py-1 text-sm font-semibold text-brand-800 shadow-[var(--shadow-card)]">
              <span className="size-2 rounded-full bg-accent-500" aria-hidden="true" />
              {t.meta.siteName}
            </p>
            <h1 className="text-[2.1rem] leading-[1.08] font-extrabold tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">{t.home.heroTitle}</h1>
            <p className="max-w-xl text-lg text-ink-soft">{t.home.heroText}</p>
            <div className="hidden max-w-xl md:block">
              <p className="mb-2 text-sm font-semibold text-ink">{t.home.heroSearchLabel}</p>
              <SearchBox size="lg" idPrefix="hero" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink href={href("/pharmacies")} variant="outline" icon="pin">
                {t.home.heroNearest}
              </ButtonLink>
              <ButtonLink href={href("/catalog")} variant="ghost" iconRight="chevronRight">
                {t.common.catalog}
              </ButtonLink>
            </div>
            <dl className="mt-2 grid max-w-xl grid-cols-3 gap-3">
              <div className="rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-card)]">
                <dt className="sr-only">{t.common.pharmacies}</dt>
                <dd className="text-2xl font-extrabold text-brand-700">{pharmacies.length}</dd>
                <dd className="text-xs leading-tight text-muted">{t.home.heroPoints}</dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-card)]">
                <dt className="sr-only">{t.common.about}</dt>
                <dd className="text-2xl font-extrabold text-brand-700">{settings.company.foundedYear}</dd>
                <dd className="text-xs leading-tight text-muted">{t.home.heroSince}</dd>
              </div>
              <div className="rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-card)]">
                <dt className="sr-only">GPP</dt>
                <dd className="text-2xl font-extrabold text-brand-700">GPP</dd>
                <dd className="text-xs leading-tight text-muted">{t.home.heroGpp}</dd>
              </div>
            </dl>
          </div>
          <div className="relative hidden aspect-square w-full max-w-[34rem] justify-self-center lg:block" aria-hidden="true">
            <div className="absolute inset-[4%] rounded-full bg-brand-100/70" />
            <div className="absolute inset-[16%] rounded-full bg-white shadow-[0_30px_80px_rgb(0_122_61/0.18)]" />
            <div className="absolute inset-[28%]">
              <Image src="/brand/salamat-mark.png" alt="" fill sizes="300px" className="object-contain" priority />
            </div>
            <div className="absolute top-[12%] left-0 flex items-center gap-3 rounded-[var(--radius-lg)] bg-white px-4 py-3 shadow-[var(--shadow-pop)]">
              <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700">
                <Icon name="pin" size={20} />
              </span>
              <span>
                <span className="block text-xs text-muted">{selected ? t.header.yourPharmacy : t.header.cityAstana}</span>
                <span className="block text-sm font-semibold">{selected ? selected.address : fmt(t.pharmacy.count, { count: pharmacies.length })}</span>
              </span>
            </div>
            <div className="absolute right-0 bottom-[14%] flex items-center gap-3 rounded-[var(--radius-lg)] bg-white px-4 py-3 shadow-[var(--shadow-pop)]">
              <span className="grid size-10 place-items-center rounded-full bg-accent-50 text-accent-600">
                <Icon name="store" size={20} />
              </span>
              <span className="text-sm font-semibold">{t.checkout.pickup}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section aria-labelledby="h-cat" className="container-page py-12">
        <SectionTitle
          id="h-cat"
          title={t.home.categoriesTitle}
          action={
            <Link href={href("/catalog")} className="hidden items-center gap-1 text-sm font-semibold text-brand-700 hover:underline sm:inline-flex">
              {t.catalog.allCategories}
              <Icon name="chevronRight" size={16} />
            </Link>
          }
        />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tree.roots.map((c) => (
            <li key={c.slug}>
              <CategoryTile slug={c.slug} name={c.name} iconKey={c.iconKey} locale={locale} />
            </li>
          ))}
        </ul>
      </section>

      {/* Promotions: only confirmed, active ones; the block is hidden when there are none. */}
      {promotions.length ? (
        <section aria-labelledby="h-promo" className="container-page pb-12">
          <SectionTitle
            id="h-promo"
            title={t.home.promotionsTitle}
            action={
              <Link href={href("/promotions")} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                {t.common.showAll}
                <Icon name="chevronRight" size={16} />
              </Link>
            }
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {promotions.slice(0, 3).map((p) => (
              <li key={p.slug}>
                <PromotionCard p={p} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Editorial picks: only products explicitly chosen by staff. */}
      {featured.length ? (
        <section aria-labelledby="h-feat" className="container-page pb-12">
          <SectionTitle id="h-feat" title={t.home.featuredTitle} />
          <p className="-mt-3 mb-5 text-sm text-muted">{t.home.featuredNote}</p>
          <ProductGrid items={featured} t={t} locale={locale} pharmacyPhone={selected?.phones[0]} />
        </section>
      ) : null}

      {/* How it works */}
      <section aria-labelledby="h-how" className="bg-surface py-12">
        <div className="container-page">
          <SectionTitle id="h-how" title={t.home.howTitle} />
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { n: 1, title: t.home.how1Title, text: t.home.how1Text, icon: "search" as const },
              { n: 2, title: t.home.how2Title, text: t.home.how2Text, icon: "pin" as const },
              { n: 3, title: t.home.how3Title, text: t.home.how3Text, icon: "phone" as const },
            ].map((s) => (
              <li key={s.n} className="flex gap-4 rounded-[var(--radius-xl)] bg-white p-5 shadow-[var(--shadow-card)]">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white">{s.n}</span>
                <span>
                  <span className="block font-semibold text-ink">{s.title}</span>
                  <span className="mt-1 block text-sm text-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pharmacies */}
      <section aria-labelledby="h-ph" className="container-page py-12">
        <SectionTitle
          id="h-ph"
          title={t.home.pharmaciesTitle}
          action={
            <Link href={href("/pharmacies")} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              {t.home.pharmaciesAll} ({pharmacies.length})
              <Icon name="chevronRight" size={16} />
            </Link>
          }
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shownPharmacies.map((p) => (
            <li key={p.id}>
              <PharmacyCard p={p} t={t} locale={locale} selected={selected?.id === p.id} routes={routeLinks(p)} />
            </li>
          ))}
        </ul>
      </section>

      {/* About + help */}
      <section className="container-page grid gap-4 pb-4 lg:grid-cols-[1.4fr_1fr]">
        <div aria-labelledby="h-about" className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-brand-800 p-6 text-white sm:p-10">
          <svg className="absolute -top-16 -right-16 h-72 w-72 text-white/10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
            <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
          </svg>
          <h2 id="h-about" className="relative text-2xl font-bold">{t.home.aboutTitle}</h2>
          <p className="relative mt-3 max-w-2xl text-white/85">
            {locale === "kk"
              ? "Дәрілік заттармен, медициналық бұйымдармен және емдік косметикамен сапалы қызмет көрсету арқылы денсаулық пен сұлулыққа қамқорлық жасау — желінің миссиясы. Дәріханаларда GPP сапа сертификаты бар."
              : "Миссия сети — забота о здоровье и красоте путём качественного обслуживания лекарственными средствами, медицинскими изделиями и лечебной косметикой. Аптеки сети обладают сертификатом качества GPP."}
          </p>
          <Link href={href("/about")} className="relative mt-6 inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-white px-4 font-semibold text-brand-800 hover:bg-brand-50">
            {t.common.more}
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
        <div aria-labelledby="h-help" className="flex flex-col justify-between gap-6 rounded-[var(--radius-2xl)] border border-line bg-white p-6 sm:p-8">
          <div>
            <h2 id="h-help" className="text-2xl font-bold text-ink">{t.home.helpTitle}</h2>
            <p className="mt-2 text-muted">{t.home.helpText}</p>
          </div>
          <div className="flex flex-col gap-3">
            <a href={telHref(settings.helpline.phone)} className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-brand-50 p-4 text-brand-800 hover:bg-brand-100">
              <Icon name="phone" />
              <span>
                <span className="block text-xs">{t.common.helpline}</span>
                <span className="block text-lg font-bold">{formatPhone(settings.helpline.phone)}</span>
              </span>
            </a>
            <Link href={href("/help")} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">
              {t.home.faqLink}
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        </div>
      </section>
      <p className="sr-only">{fmt(t.pharmacy.count, { count: pharmacies.length })}</p>
    </>
  );
}
