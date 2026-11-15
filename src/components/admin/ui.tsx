import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-[var(--radius-lg)] border border-line bg-white p-5", className)}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-white">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead className="bg-surface text-left text-xs font-semibold tracking-wide text-muted uppercase">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="px-3 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty ? <p className="p-6 text-center text-sm text-muted">{empty}</p> : null}
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-top", className)}>{children}</td>;
}

export function AdminLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("font-medium text-brand-700 hover:underline", className)}>
      {children}
    </Link>
  );
}

const statusTone: Record<string, string> = {
  NEW: "bg-accent-50 text-accent-700",
  PROCESSING: "bg-warn-50 text-warn-700",
  CONFIRMED: "bg-info-50 text-info-700",
  READY: "bg-brand-50 text-brand-800",
  COMPLETED: "bg-surface text-ink-soft",
  CANCELLED: "bg-surface text-muted line-through",
  DRAFT: "bg-warn-50 text-warn-700",
  PUBLISHED: "bg-brand-50 text-brand-800",
  ARCHIVED: "bg-surface text-muted",
  PREVIEW: "bg-info-50 text-info-700",
  APPLYING: "bg-warn-50 text-warn-700",
  FAILED: "bg-accent-50 text-accent-700",
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", statusTone[status] ?? "bg-surface text-ink-soft")}>{label ?? status}</span>;
}

export const inputCls =
  "h-10 w-full rounded-[var(--radius-md)] border border-line-strong bg-white px-3 text-sm focus:border-brand-600 focus:outline-3 focus:outline-brand-600/25";

export function Field({ label, name, defaultValue, type = "text", required, hint, placeholder, className, step, min, max }: { label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean; hint?: string; placeholder?: string; className?: string; step?: string; min?: number; max?: number }) {
  const id = `f-${name}`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-accent-600"> *</span> : null}
      </label>
      <input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} step={step} min={min} max={max} className={inputCls} />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function TextArea({ label, name, defaultValue, rows = 4, hint, className, required }: { label: string; name: string; defaultValue?: string | null; rows?: number; hint?: string; className?: string; required?: boolean }) {
  const id = `f-${name}`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? <span className="text-accent-600"> *</span> : null}
      </label>
      <textarea id={id} name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} className="w-full rounded-[var(--radius-md)] border border-line-strong bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-3 focus:outline-brand-600/25" />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, name, defaultValue, options, className, hint }: { label: string; name: string; defaultValue?: string | null; options: { value: string; label: string }[]; className?: string; hint?: string }) {
  const id = `f-${name}`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function CheckField({ label, name, defaultChecked, hint, value }: { label: string; name: string; defaultChecked?: boolean; hint?: string; value?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-brand-600" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function AdminPagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Страницы" className="mt-4 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? <Link className="rounded border border-line px-3 py-1.5 hover:border-brand-600" href={hrefFor(page - 1)}>← Назад</Link> : null}
      <span className="text-muted">Страница {page} из {pageCount}</span>
      {page < pageCount ? <Link className="rounded border border-line px-3 py-1.5 hover:border-brand-600" href={hrefFor(page + 1)}>Далее →</Link> : null}
    </nav>
  );
}
