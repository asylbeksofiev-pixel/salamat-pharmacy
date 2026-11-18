import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "../icons";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold select-none whitespace-nowrap " +
  "transition-[background-color,border-color,color,box-shadow,scale] duration-200 ease-[var(--ease-out-soft)] " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-safe:active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-55";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-[0_1px_0_rgb(0_0_0/0.08)]",
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100",
  outline: "border border-line-strong bg-white text-ink hover:border-brand-600 hover:text-brand-700",
  ghost: "text-ink-soft hover:bg-surface hover:text-ink",
  danger: "bg-accent-600 text-white hover:bg-accent-700",
  accent: "bg-accent-500 text-white hover:bg-accent-600",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[0.95rem]",
  lg: "h-13 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, iconRight, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === "sm" ? 18 : 20} /> : null}
    </button>
  );
}

type LinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName; iconRight?: IconName };

export function ButtonLink({ variant = "primary", size = "md", icon, iconRight, className, children, ...rest }: LinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 18 : 20} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 18 : 20} /> : null}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  className,
  badge,
  variant = "ghost",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; badge?: number; variant?: ButtonVariant }) {
  return (
    <button type="button" aria-label={label} className={cn(buttonClass(variant, "md", "relative size-11 px-0"), className)} {...rest}>
      <Icon name={icon} />
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[0.7rem] leading-5 font-bold text-white" aria-hidden="true">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}
