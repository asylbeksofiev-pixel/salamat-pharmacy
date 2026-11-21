import Image from "next/image";
import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/i18n";
import { formatPhone, telHref } from "@/lib/format";
import type { CompanySetting } from "@/server/settings";
import { Icon } from "../icons";

export function Footer({ locale, t, helpline, company, categories, orderingEnabled }: { locale: Locale; t: Dictionary; helpline: string; company: CompanySetting; categories: { slug: string; name: string }[]; orderingEnabled: boolean }) {
  const href = (p: string) => localizedPath(locale, p);
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-surface pb-[calc(6rem+var(--sal-actionbar-h,0px))] md:pb-0">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Image src="/brand/salamat-logo.png" alt="SALAMAT" width={1450} height={366} className="h-9 w-auto self-start" />
          <p className="max-w-xs text-sm text-muted">{t.meta.siteName} — {t.home.heroSince}.</p>
          <a href={telHref(helpline)} className="flex items-center gap-3 self-start rounded-[var(--radius-lg)] bg-white p-3 pr-5 shadow-[var(--shadow-card)] hover:text-brand-700">
            <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Icon name="phone" size={20} />
            </span>
            <span>
              <span className="block text-xs text-muted">{t.common.helpline}</span>
              <span className="block font-semibold">{formatPhone(helpline)}</span>
            </span>
          </a>
        </div>
        <nav aria-labelledby="f-catalog">
          <h2 id="f-catalog" className="mb-3 text-sm font-bold tracking-wider text-ink uppercase">{t.common.catalog}</h2>
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center font-medium hover:text-brand-700 hover:underline md:min-h-0" href={href("/catalog")}>{t.items.allProducts}</Link></li>
            {categories.slice(0, 9).map((c) => (
              <li key={c.slug}><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href(`/catalog/${c.slug}`)}>{c.name}</Link></li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="f-customers">
          <h2 id="f-customers" className="mb-3 text-sm font-bold tracking-wider text-ink uppercase">{t.footer.customers}</h2>
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/pharmacies")}>{t.common.pharmacies}</Link></li>
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/promotions")}>{t.common.promotions}</Link></li>
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/help")}>{t.common.help}</Link></li>
            {orderingEnabled ? <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/cart")}>{t.common.cart}</Link></li> : null}
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/favorites")}>{t.common.favorites}</Link></li>
          </ul>
        </nav>
        <nav aria-labelledby="f-company">
          <h2 id="f-company" className="mb-3 text-sm font-bold tracking-wider text-ink uppercase">{t.footer.company}</h2>
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/about")}>{t.common.about}</Link></li>
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/contacts")}>{t.common.contacts}</Link></li>
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/privacy")}>{t.common.privacy}</Link></li>
            <li><Link className="inline-flex min-h-11 items-center hover:text-brand-700 hover:underline md:min-h-0" href={href("/terms")}>{t.common.terms}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-3 py-6 text-xs leading-relaxed text-muted md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl space-y-1">
            <p>{t.footer.legalNote}</p>
            <p className="font-semibold text-ink-soft">{t.footer.medicalNote}</p>
          </div>
          <p className="shrink-0">
            © 2016–{year} {company.legalName}. {t.footer.binLabel} {company.bin.replace(/(\d{3})(?=\d)/g, "$1 ")}. {t.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
