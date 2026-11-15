"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, isIconName } from "../icons";
import { cn } from "../ui/cn";
import { Drawer } from "../ui/Dialog";
import { useSite } from "./SiteProvider";
import { useCartCount, useFavorites, useHydrated } from "@/lib/client/stores";
import { fmt, localeLabels, localeNames, localizedPath, locales, splitLocale } from "@/lib/i18n/config";
import { formatPhone, telHref } from "@/lib/format";

export interface MenuCategory {
  slug: string;
  name: string;
  iconKey: string | null;
  children: { slug: string; name: string }[];
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useSite();
  const pathname = usePathname() || "/";
  const search = useSearchParams();
  const { path } = splitLocale(pathname);
  return (
    <div className={cn("flex items-center gap-0.5 rounded-full bg-surface p-0.5", className)} role="group" aria-label={t.common.language}>
      {locales.map((l) => {
        const params = new URLSearchParams(search?.toString());
        params.set("lang", l);
        const target = `${localizedPath(l, path)}?${params.toString()}`;
        const current = l === locale;
        return (
          <a
            key={l}
            href={target}
            hrefLang={l}
            lang={l}
            aria-current={current ? "true" : undefined}
            title={localeNames[l]}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-bold tracking-wide transition-colors",
              current ? "bg-white text-brand-700 shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <span className="sr-only">{localeNames[l]}</span>
            <span aria-hidden="true">{localeLabels[l]}</span>
          </a>
        );
      })}
    </div>
  );
}

export function PharmacyChip({ compact = false }: { compact?: boolean }) {
  const { pharmacy, t, openPharmacyPicker } = useSite();
  return (
    <button
      type="button"
      onClick={openPharmacyPicker}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] text-left transition-colors",
        compact ? "w-full border border-line px-3 py-2" : "max-w-[15rem] px-2.5 py-1.5 hover:bg-surface",
        pharmacy ? "" : "text-brand-700",
      )}
    >
      <Icon name="pin" size={20} className={cn("shrink-0", pharmacy ? "text-brand-600" : "text-accent-500")} />
      <span className="min-w-0">
        <span className="block text-[0.72rem] leading-tight text-muted">{pharmacy ? t.header.yourPharmacy : t.common.pharmacies}</span>
        <span className="block truncate text-sm leading-tight font-semibold">{pharmacy ? pharmacy.address : t.header.selectPharmacy}</span>
      </span>
    </button>
  );
}

export function HeaderCounters() {
  const { t, href } = useSite();
  const hydrated = useHydrated();
  const count = useCartCount();
  const favs = useFavorites().length;
  const c = hydrated ? count : 0;
  const f = hydrated ? favs : 0;
  return (
    <div className="flex items-center gap-1">
      <Link href={href("/favorites")} className="relative hidden size-11 place-items-center rounded-[var(--radius-md)] text-ink-soft hover:bg-surface hover:text-ink md:grid" aria-label={`${t.common.favorites}${f ? `. ${fmt(t.header.favoritesCount, { count: f })}` : ""}`}>
        <Icon name="heart" />
        {f ? <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[0.7rem] leading-5 font-bold text-white" aria-hidden="true">{f}</span> : null}
      </Link>
      <Link
        href={href("/cart")}
        className="relative flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-2.5 text-ink-soft hover:bg-surface hover:text-ink"
        aria-label={`${t.common.cart}${c ? `. ${fmt(t.header.cartCount, { count: c })}` : ""}`}
      >
        <span className="relative">
          <Icon name="cart" />
          {c ? <span className="absolute -top-2 -right-2.5 grid min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[0.7rem] leading-5 font-bold text-white" aria-hidden="true">{c}</span> : null}
        </span>
        <span className="hidden text-sm font-semibold lg:inline">{t.common.cart}</span>
      </Link>
    </div>
  );
}

export function CatalogMenu({ categories }: { categories: MenuCategory[] }) {
  const { t, href } = useSite();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="catalog-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 items-center gap-2 rounded-[var(--radius-lg)] bg-brand-600 px-4 font-semibold text-white transition-colors hover:bg-brand-700"
      >
        <Icon name={open ? "close" : "grid"} size={20} />
        {t.common.catalog}
      </button>
      {open ? (
        <div id="catalog-menu" className="anim-pop absolute top-full left-0 z-50 mt-2 w-[min(46rem,calc(100vw-3rem))] rounded-[var(--radius-xl)] border border-line bg-white p-3 shadow-[var(--shadow-pop)]">
          <ul className="grid grid-cols-2 gap-1">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={href(`/catalog/${c.slug}`)} className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-brand-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                    <Icon name={isIconName(c.iconKey) ? c.iconKey : "box"} size={20} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{c.name}</span>
                    {c.children.length ? <span className="block truncate text-xs text-muted">{c.children.map((x) => x.name).join(", ")}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-line px-3 pt-3">
            <Link href={href("/catalog")} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              {t.catalog.allCategories}
              <Icon name="chevronRight" size={16} />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MobileMenu({ categories }: { categories: MenuCategory[] }) {
  const { t, href, helpline } = useSite();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  const links = [
    { href: "/pharmacies", label: t.common.pharmacies, icon: "store" as const },
    { href: "/promotions", label: t.common.promotions, icon: "tag" as const },
    { href: "/favorites", label: t.common.favorites, icon: "heart" as const },
    { href: "/about", label: t.common.about, icon: "info" as const },
    { href: "/help", label: t.common.help, icon: "question" as const },
    { href: "/contacts", label: t.common.contacts, icon: "phone" as const },
  ];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-[var(--radius-md)] text-ink hover:bg-surface md:hidden" aria-label={t.common.menu} aria-haspopup="dialog">
        <Icon name="menu" />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={t.common.menu} closeLabel={t.common.closeMenu} side="left">
        <div className="flex flex-col gap-5">
          <PharmacyChip compact />
          <LanguageSwitcher className="self-start" />
          <nav aria-label={t.common.catalog}>
            <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">{t.common.catalog}</p>
            <ul className="flex flex-col">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={href(`/catalog/${c.slug}`)} className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2.5 hover:bg-surface">
                    <Icon name={isIconName(c.iconKey) ? c.iconKey : "box"} size={20} className="text-brand-600" />
                    <span className="font-medium">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t.footer.sections}>
            <ul className="flex flex-col border-t border-line pt-3">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={href(l.href)} className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2.5 hover:bg-surface">
                    <Icon name={l.icon} size={20} className="text-muted" />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <a href={telHref(helpline)} className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-brand-50 p-3 text-brand-800">
            <Icon name="phone" />
            <span>
              <span className="block text-xs">{t.common.helpline}</span>
              <span className="block font-semibold">{formatPhone(helpline)}</span>
            </span>
          </a>
        </div>
      </Drawer>
    </>
  );
}

export function MobileBottomNav() {
  const { t, href, locale } = useSite();
  const pathname = usePathname() || "/";
  const hydrated = useHydrated();
  const count = useCartCount();
  const favs = useFavorites().length;
  const { path } = splitLocale(pathname);
  const items = [
    { href: "/", label: t.common.home, icon: "home" as const, match: (p: string) => p === "/" },
    { href: "/catalog", label: t.common.catalog, icon: "grid" as const, match: (p: string) => p.startsWith("/catalog") || p.startsWith("/product") || p.startsWith("/search") },
    { href: "/pharmacies", label: t.common.pharmacies, icon: "store" as const, match: (p: string) => p.startsWith("/pharmacies") },
    { href: "/favorites", label: t.common.favorites, icon: "heart" as const, match: (p: string) => p.startsWith("/favorites"), badge: hydrated ? favs : 0 },
    { href: "/cart", label: t.common.cart, icon: "cart" as const, match: (p: string) => p.startsWith("/cart") || p.startsWith("/checkout"), badge: hydrated ? count : 0 },
  ];
  return (
    <nav aria-label={t.common.menu} style={{ viewTransitionName: "bottom-nav" }} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" lang={locale}>
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = it.match(path);
          return (
            <li key={it.href}>
              <Link href={href(it.href)} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.68rem] font-medium", active ? "text-brand-700" : "text-muted")}>
                <span className="relative">
                  <Icon name={it.icon} size={22} />
                  {it.badge ? <span className="absolute -top-1.5 -right-2.5 grid min-w-4.5 place-items-center rounded-full bg-accent-500 px-1 text-[0.62rem] leading-[1.125rem] font-bold text-white" aria-hidden="true">{it.badge}</span> : null}
                </span>
                <span className="max-w-full truncate px-0.5">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
