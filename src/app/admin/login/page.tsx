import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await getCurrentStaff()) redirect("/admin");
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
        <Image src="/brand/salamat-logo.png" alt="SALAMAT" width={1450} height={366} className="h-9 w-auto" priority />
        <h1 className="mt-6 text-xl font-bold">Вход для сотрудников</h1>
        <p className="mt-1 text-sm text-muted">Админ-панель аптечной сети SALAMAT</p>
        <LoginForm />
      </div>
    </main>
  );
}
