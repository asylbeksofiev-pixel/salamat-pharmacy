import Image from "next/image";
import Link from "next/link";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/i18n";
import { formatPhone, telHref } from "@/lib/format";
import { Icon } from "../icons";
import { SearchBox } from "./SearchBox";
import { CatalogMenu, HeaderCounters, LanguageSwitcher, MobileMenu, PharmacyChip, type MenuCategory } from "./HeaderParts";

export function Header({ locale, t, categories, helpline, cityName }: { locale: Locale; t: Dictionary; categories: MenuCategory[]; helpline: string; cityName: string }) {
  const href = (p: string) => localizedPath(locale, p);
  return (
    <header style={{ viewTransitionName: "site-header" }} className="relative z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 md:sticky md:top-0">
      <div className="hidden border-b border-line md:block">
        <div className="container-page flex h-10 items-center justify-between gap-6 text-sm">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5 text-ink-soft" title={t.header.otherCitiesSoon}>
              <Icon name="pin" size={16} className="text-brand-600" />
              <span className="sr-only">{t.common.city}: </span>
              <span className="font-semibold">{cityName}</span>
            </span>
            <nav aria-label={t.footer.sections}>
              <ul className="flex items-center gap-4 text-muted">
                <li><Link className="hover:text-brand-700" href={href("/pharmacies")}>{t.common.pharmacies}</Link></li>
                <li><Link className="hover:text-brand-700" href={href("/promotions")}>{t.common.promotions}</Link></li>
                <li><Link className="hover:text-brand-700" href={href("/help")}>{t.common.help}</Link></li>
                <li><Link className="hover:text-brand-700" href={href("/about")}>{t.common.about}</Link></li>
              </ul>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <a href={telHref(helpline)} className="flex items-center gap-1.5 font-semibold text-ink hover:text-brand-700">
              <Icon name="phone" size={16} className="text-brand-600" />
              <span className="sr-only">{t.common.helpline}: </span>
              {formatPhone(helpline)}
            </a>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
      <div className="container-page flex h-16 items-center gap-2 md:h-20 md:gap-4">
        <MobileMenu categories={categories} />
        <Link href={href("/")} className="shrink-0 rounded-md" aria-label={`${t.meta.siteName} — ${t.common.home}`}>
          <Image src="/brand/salamat-logo.png" alt="SALAMAT" width={1450} height={366} priority className="h-8 w-auto md:h-10" />
        </Link>
        <CatalogMenu categories={categories} />
        <div className="hidden min-w-0 flex-1 md:block">
          <SearchBox idPrefix="hdr" />
        </div>
        <div className="ml-auto hidden xl:block">
          <PharmacyChip />
        </div>
        <div className="ml-auto md:ml-0">
          <HeaderCounters />
        </div>
      </div>
      <div className="container-page flex flex-col gap-2 pb-3 md:hidden">
        <SearchBox idPrefix="mob" />
        <PharmacyChip compact />
      </div>
      <div className="container-page hidden pb-3 md:block xl:hidden">
        <div className="max-w-sm">
          <PharmacyChip compact />
        </div>
      </div>
    </header>
  );
}
