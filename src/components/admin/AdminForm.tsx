"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/server/admin/action-state";
import { Button, type ButtonVariant } from "../ui/Button";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

/** Form bound to a guarded server action, with pending state and a result message. */
export function AdminForm({
  action,
  children,
  submitLabel = "Сохранить",
  submitVariant = "primary",
  className,
  resetOnSuccess = false,
  confirm,
  inline = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel?: string;
  submitVariant?: ButtonVariant;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={cn(inline ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-4", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className={cn("flex flex-wrap items-center gap-3", inline ? "" : "pt-1")}>
        <Button type="submit" loading={pending} variant={submitVariant} size={inline ? "sm" : "md"}>
          {submitLabel}
        </Button>
        {state.message ? (
          <p role="status" className={cn("flex items-center gap-1.5 text-sm font-medium", state.ok ? "text-brand-700" : "text-accent-600")}>
            <Icon name={state.ok ? "checkCircle" : "alert"} size={16} />
            {state.message}
          </p>
        ) : null}
      </div>
      {state.errors && Object.keys(state.errors).length ? (
        <ul className="list-disc pl-5 text-sm text-accent-600">
          {Object.entries(state.errors).map(([k, v]) => (
            <li key={k}>
              <span className="font-mono text-xs">{k}</span>: {v}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
