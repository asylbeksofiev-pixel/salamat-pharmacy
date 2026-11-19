"use client";
// Modal and Drawer built on the native <dialog>: focus is trapped, Escape closes, focus returns to the trigger.
// Opening and closing are animated (CSS in globals.css); content stays mounted until the close animation ends.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "../icons";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  className?: string;
  description?: ReactNode;
}

const CLOSE_FALLBACK_MS = 260;

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  // Keep content rendered while the closing animation plays.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      delete d.dataset.closing;
      if (!d.open) {
        opener.current = document.activeElement;
        d.showModal();
        document.documentElement.style.overflow = "hidden";
      }
      return;
    }
    if (!d.open) return;
    // Play the exit animation, then really close the dialog.
    d.dataset.closing = "true";
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      d.removeEventListener("animationend", onEnd);
      delete d.dataset.closing;
      d.close();
      setMounted(false);
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target === d) finish();
    };
    d.addEventListener("animationend", onEnd);
    const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS);
    return () => {
      window.clearTimeout(timer);
      d.removeEventListener("animationend", onEnd);
    };
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handleClose = () => {
      document.documentElement.style.overflow = "";
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
    // Escape: let the parent close us so the exit animation runs.
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    d.addEventListener("close", handleClose);
    d.addEventListener("cancel", handleCancel);
    return () => {
      d.removeEventListener("close", handleClose);
      d.removeEventListener("cancel", handleCancel);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return { ref, mounted };
}

export function Modal({ open, onClose, title, children, footer, closeLabel, className, description }: DialogProps) {
  const { ref, mounted } = useDialog(open, onClose);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "sal-modal m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-xl)] bg-white p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-ink/45 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {mounted ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink" aria-label={closeLabel}>
              <Icon name="close" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Drawer({ open, onClose, title, children, footer, closeLabel, className, side = "right", description }: DialogProps & { side?: "left" | "right" | "bottom" }) {
  const { ref, mounted } = useDialog(open, onClose);
  const titleId = useId();
  const pos =
    side === "left"
      ? "sal-drawer-left mr-auto ml-0 h-dvh max-h-dvh w-[min(24rem,92vw)] rounded-r-[var(--radius-xl)]"
      : side === "bottom"
        ? "sal-drawer-bottom mt-auto mb-0 w-full max-w-none max-h-[88dvh] rounded-t-[var(--radius-xl)]"
        : "sal-drawer-right ml-auto mr-0 h-dvh max-h-dvh w-[min(28rem,94vw)] rounded-l-[var(--radius-xl)]";
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn("bg-white p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-ink/45", pos, className)}
    >
      {mounted ? (
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink" aria-label={closeLabel}>
              <Icon name="close" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
