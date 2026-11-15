"use client";
// Modal and Drawer built on the native <dialog>: focus is trapped, Escape closes, focus returns to the trigger.
import { useEffect, useRef, type ReactNode } from "react";
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

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      if (!open) document.documentElement.style.overflow = "";
    };
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handleClose = () => {
      document.documentElement.style.overflow = "";
      if (opener.current instanceof HTMLElement) opener.current.focus();
      onClose();
    };
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("close", handleClose);
    d.addEventListener("cancel", handleCancel);
    return () => {
      d.removeEventListener("close", handleClose);
      d.removeEventListener("cancel", handleCancel);
    };
  }, [onClose]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, closeLabel, className, description }: DialogProps) {
  const ref = useDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-xl)] bg-white p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-ink/45 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={closeLabel}>
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
  const ref = useDialog(open, onClose);
  const pos =
    side === "left"
      ? "mr-auto ml-0 h-dvh max-h-dvh w-[min(24rem,92vw)] rounded-r-[var(--radius-xl)]"
      : side === "bottom"
        ? "mt-auto mb-0 w-full max-w-none max-h-[88dvh] rounded-t-[var(--radius-xl)]"
        : "ml-auto mr-0 h-dvh max-h-dvh w-[min(28rem,94vw)] rounded-l-[var(--radius-xl)]";
  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn("bg-white p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-ink/45", pos, className)}
    >
      {open ? (
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="drawer-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink" aria-label={closeLabel}>
              <Icon name="close" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
