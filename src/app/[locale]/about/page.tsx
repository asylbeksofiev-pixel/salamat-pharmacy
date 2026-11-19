import Image from "next/image";
import { notFound } from "next/navigation";
import { getDictionary, isLocale, localizedPath } from "@/lib/i18n";
import { pageMetadata } from "@/server/seo";
import { env } from "@/server/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { ButtonLink } from "@/components/ui/Button";
import { HomeScrollMotion } from "@/components/site/HomeScrollMotion";
import { Icon, type IconName } from "@/components/icons";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return pageMetadata(locale, "/about", t.about.title, t.about.metaDescription);
}

/**
 * "About us" as short themed blocks instead of one long text. Only facts from the network's own materials:
 * legal entity and founding year, mission, GPP certificate and specialists, product range, where the pharmacies
 * are, and how ordering on this site works. No invented history, numbers or awards.
 */
export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale);
  const href = (p: string) => localizedPath(locale, p);
  const cards: { icon: IconName; title: string; text: string }[] = [
    { icon: "heart", title: t.about.missionTitle, text: t.about.missionText },
    { icon: "shield", title: t.about.qualityTitle, text: t.about.qualityText },
    { icon: "pill", title: t.about.rangeTitle, text: t.about.rangeText },
  ];
  return (
    <HomeScrollMotion>
      <div className="container-page py-6 md:py-10">
        <Breadcrumbs items={[{ label: t.common.home, href: href("/") }, { label: t.about.title }]} label={t.common.breadcrumbs} baseUrl={env.appUrl} />
        <header className="mt-4 max-w-3xl">
          <h1 className="text-[1.9rem] leading-tight font-bold tracking-tight text-balance text-ink sm:text-[2.5rem]">{t.about.title}</h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-soft sm:text-lg">{t.about.lead}</p>
        </header>

        {/* Who we are: the one highlighted block. */}
        <section aria-labelledby="about-who" data-home-reveal className="relative mt-8 overflow-hidden rounded-[var(--radius-2xl)] bg-brand-800 p-6 text-white sm:p-8 md:p-10">
          <div className="pointer-events-none absolute -right-10 -bottom-12 w-56 opacity-15 sm:w-72" aria-hidden="true">
            <Image src="/brand/salamat-mark.png" alt="" width={300} height={300} className="h-auto w-full brightness-0 invert" />
          </div>
          <span className="grid size-12 place-items-center rounded-full bg-white/15" aria-hidden="true">
            <Icon name="store" size={24} />
          </span>
          <h2 id="about-who" className="relative mt-4 text-2xl font-bold">
            {t.about.whoTitle}
          </h2>
          <p className="relative mt-2 max-w-2xl text-[1.05rem] leading-relaxed text-white/90">{t.about.whoText}</p>
        </section>

        {/* Mission, quality, range. */}
        <ul className="sal-home-grid mt-4 grid gap-4 md:grid-cols-3">
          {cards.map((c, i) => (
            <li key={c.title} data-home-reveal className="flex flex-col rounded-[var(--radius-2xl)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
              <span className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-700" aria-hidden="true">
                <Icon name={c.icon} size={22} />
              </span>
              <h2 id={`about-card-${i}`} className="mt-4 text-lg font-semibold text-ink">
                {c.title}
              </h2>
              <p className="mt-2 leading-relaxed text-ink-soft">{c.text}</p>
            </li>
          ))}
        </ul>

        {/* Where to find us and how ordering works — each with its next step. */}
        <div className="sal-home-grid mt-4 grid gap-4 md:grid-cols-2">
          <section aria-labelledby="about-pharmacies" data-home-reveal className="flex flex-col gap-4 rounded-[var(--radius-2xl)] bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-700" aria-hidden="true">
                <Icon name="pin" size={22} />
              </span>
              <div className="min-w-0">
                <h2 id="about-pharmacies" className="text-lg font-semibold text-ink">
                  {t.about.pharmaciesTitle}
                </h2>
                <p className="mt-1.5 leading-relaxed text-ink-soft">{t.about.pharmaciesText}</p>
              </div>
            </div>
            <ButtonLink href={href("/pharmacies")} variant="outline" icon="pin" wrap className="mt-auto self-start">
              {t.about.pharmaciesCta}
            </ButtonLink>
          </section>
          <section aria-labelledby="about-help" data-home-reveal className="flex flex-col gap-4 rounded-[var(--radius-2xl)] bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand-700" aria-hidden="true">
                <Icon name="search" size={22} />
              </span>
              <div className="min-w-0">
                <h2 id="about-help" className="text-lg font-semibold text-ink">
                  {t.about.helpTitle}
                </h2>
                <p className="mt-1.5 leading-relaxed text-ink-soft">{t.about.helpText}</p>
              </div>
            </div>
            <ButtonLink href={href("/catalog")} icon="grid" wrap className="mt-auto self-start">
              {t.about.helpCta}
            </ButtonLink>
          </section>
        </div>
      </div>
    </HomeScrollMotion>
  );
}
