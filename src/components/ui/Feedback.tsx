import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "../icons";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-md)] bg-surface", className)} aria-hidden="true" />;
}

export function EmptyState({ icon = "box", title, text, action, className }: { icon?: IconName; title: ReactNode; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center", className)}>
      <span className="grid size-14 place-items-center rounded-full bg-white text-brand-600 shadow-[var(--shadow-card)]">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="text-lg font-semibold [overflow-wrap:anywhere] text-ink">{title}</h2>
      {text ? <p className="max-w-md text-muted">{text}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, text, action }: { title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-accent-100 bg-accent-50 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-white text-accent-600">
        <Icon name="alert" size={26} />
      </span>
      <h2 className="text-lg font-semibold [overflow-wrap:anywhere] text-ink">{title}</h2>
      {text ? <p className="max-w-md text-ink-soft">{text}</p> : null}
      {action}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface text-ink-soft border-line",
  success: "bg-brand-50 text-brand-800 border-brand-100",
  warning: "bg-warn-50 text-warn-700 border-warn-200",
  danger: "bg-accent-50 text-accent-700 border-accent-100",
  info: "bg-info-50 text-info-700 border-info-50",
  brand: "bg-brand-600 text-white border-brand-600",
  accent: "bg-accent-500 text-white border-accent-500",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap", tones[tone], className)}>
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
    </span>
  );
}

export function Notice({ tone = "info", icon, title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; icon?: IconName; title?: ReactNode; children: ReactNode; className?: string }) {
  const map = {
    info: { cls: "bg-info-50 text-info-700", icon: "info" as IconName },
    warning: { cls: "bg-warn-50 text-warn-700", icon: "alert" as IconName },
    danger: { cls: "bg-accent-50 text-accent-700", icon: "alert" as IconName },
    success: { cls: "bg-brand-50 text-brand-800", icon: "checkCircle" as IconName },
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-[var(--radius-md)] px-4 py-3 text-[0.9375rem]", map.cls, className)}>
      <Icon name={icon ?? map.icon} size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title ? "mt-0.5" : "", "text-ink-soft")}>{children}</div>
      </div>
    </div>
  );
}
