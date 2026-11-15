import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { requireStaffPage } from "@/server/auth/session";
import { can, ROLE_LABELS, type Permission } from "@/server/auth/permissions";
import { logoutAction } from "../auth-actions";
import { Icon, type IconName } from "@/components/icons";
import { AdminNavLink } from "@/components/admin/AdminNavLink";

const NAV: { href: string; label: string; icon: IconName; perm: Permission }[] = [
  { href: "/admin", label: "Обзор", icon: "home", perm: "dashboard.view" },
  { href: "/admin/orders", label: "Заявки", icon: "cart", perm: "orders.read" },
  { href: "/admin/products", label: "Товары", icon: "box", perm: "catalog.read" },
  { href: "/admin/categories", label: "Категории", icon: "grid", perm: "catalog.write" },
  { href: "/admin/brands", label: "Бренды", icon: "tag", perm: "catalog.write" },
  { href: "/admin/pharmacies", label: "Филиалы", icon: "store", perm: "pharmacies.read" },
  { href: "/admin/inventory", label: "Цены и остатки", icon: "file", perm: "prices.read" },
  { href: "/admin/import", label: "Импорт / экспорт", icon: "upload", perm: "catalog.import" },
  { href: "/admin/promotions", label: "Акции", icon: "gift", perm: "promotions.write" },
  { href: "/admin/content", label: "Страницы и FAQ", icon: "edit", perm: "content.write" },
  { href: "/admin/staff", label: "Сотрудники и роли", icon: "user", perm: "staff.manage" },
  { href: "/admin/settings", label: "Настройки", icon: "settings", perm: "settings.manage" },
  { href: "/admin/audit", label: "История изменений", icon: "history", perm: "audit.read" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaffPage("dashboard.view");
  const items = NAV.filter((n) => can(user, n.perm));
  const nav = (
    <ul className="flex flex-col gap-0.5">
      {items.map((n) => (
        <li key={n.href}>
          <AdminNavLink href={n.href} exact={n.href === "/admin"}>
            <Icon name={n.icon} size={18} />
            {n.label}
          </AdminNavLink>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside style={{ viewTransitionName: "admin-sidebar" }} className="hidden border-r border-line bg-white lg:flex lg:flex-col">
        <div className="sticky top-0 flex max-h-screen flex-col gap-4 overflow-y-auto p-4">
          <Link href="/admin" className="px-2 pt-1">
            <Image src="/brand/salamat-logo.png" alt="SALAMAT" width={1450} height={366} className="h-7 w-auto" />
          </Link>
          <nav aria-label="Разделы админ-панели">{nav}</nav>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <details className="relative lg:hidden">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-md)] border border-line px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Icon name="menu" size={18} /> Меню
            </summary>
            <nav aria-label="Разделы админ-панели" className="absolute top-12 left-0 z-40 w-64 rounded-[var(--radius-lg)] border border-line bg-white p-2 shadow-[var(--shadow-pop)]">{nav}</nav>
          </details>
          <Link href="/" className="hidden items-center gap-1 text-sm text-muted hover:text-brand-700 sm:inline-flex" target="_blank">
            <Icon name="external" size={16} /> Открыть сайт
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted">{user.roles.map((r) => ROLE_LABELS[r]).join(", ")}</p>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="grid size-10 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface hover:text-ink" aria-label="Выйти" title="Выйти">
                <Icon name="logout" size={20} />
              </button>
            </form>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <ViewTransition default="page">
            <div>{children}</div>
          </ViewTransition>
        </main>
      </div>
    </div>
  );
}
