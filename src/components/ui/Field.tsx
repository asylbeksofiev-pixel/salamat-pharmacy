import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { Icon } from "../icons";

const control =
  "block w-full rounded-[var(--radius-md)] border border-line-strong bg-white px-3.5 text-[1rem] text-ink placeholder:text-muted/80 " +
  "transition-colors duration-150 hover:border-muted focus:border-brand-600 focus:outline-3 focus:outline-offset-0 focus:outline-brand-600/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted aria-[invalid=true]:border-accent-600 aria-[invalid=true]:focus:outline-accent-600/25";

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  hideLabel?: boolean;
}

export function FieldShell({ id, label, hint, error, required, children, className, hideLabel }: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-sm font-semibold text-ink", hideLabel && "sr-only")}>
        {label}
        {required ? <span className="text-accent-600" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[0.8125rem] font-medium text-accent-600" role="alert">
          <Icon name="alert" size={16} className="mt-px shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null; hideLabel?: boolean; wrapperClassName?: string };

export function Input({ label, hint, error, id, className, required, hideLabel, wrapperClassName, ...rest }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  const describedBy = error ? `${fid}-error` : hint ? `${fid}-hint` : undefined;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={wrapperClassName}>
      <input id={fid} className={cn(control, "h-12", className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} {...rest} />
    </FieldShell>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: string | null };

export function Textarea({ label, hint, error, id, className, required, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} required={required}>
      <textarea id={fid} className={cn(control, "min-h-24 py-3", className)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined} required={required} {...rest} />
    </FieldShell>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: string | null; hideLabel?: boolean; wrapperClassName?: string };

export function Select({ label, hint, error, id, className, children, hideLabel, wrapperClassName, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={wrapperClassName}>
      <div className="relative">
        <select id={fid} className={cn(control, "h-12 appearance-none pr-10", className)} aria-invalid={error ? true : undefined} {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={18} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </div>
    </FieldShell>
  );
}

type CheckProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; error?: string | null; description?: ReactNode };

export function Checkbox({ label, error, description, id, className, ...rest }: CheckProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={fid} className="group flex cursor-pointer items-start gap-3 text-[0.95rem] text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <span className="relative mt-0.5 size-5 shrink-0">
          <input
            id={fid}
            type="checkbox"
            className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-[5px] border-2 border-line-strong bg-white transition-colors checked:border-brand-600 checked:bg-brand-600 hover:border-brand-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600 aria-[invalid=true]:border-accent-600"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fid}-error` : undefined}
            {...rest}
          />
          <svg className="pointer-events-none absolute inset-0 hidden size-5 text-white peer-checked:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="m6 12.5 4 4L18 8" />
          </svg>
        </span>
        <span>
          {label}
          {description ? <span className="mt-0.5 block text-sm text-muted">{description}</span> : null}
        </span>
      </label>
      {error ? (
        <p id={`${fid}-error`} className="ml-8 text-[0.8125rem] font-medium text-accent-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Radio({ label, description, id, className, ...rest }: CheckProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label
      htmlFor={fid}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-line-strong bg-white p-3.5 transition-colors hover:border-brand-600",
        "has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:border-line-strong",
        className,
      )}
    >
      <input
        id={fid}
        type="radio"
        className="mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-line-strong bg-white transition-all checked:border-[6px] checked:border-brand-600 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        {...rest}
      />
      <span className="flex flex-col">
        <span className="font-semibold text-ink">{label}</span>
        {description ? <span className="text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}
