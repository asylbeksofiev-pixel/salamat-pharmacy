import "@fontsource-variable/onest";
import "../globals.css";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Админ-панель SALAMAT", template: "%s — Админ-панель SALAMAT" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full bg-surface">{children}</body>
    </html>
  );
}
