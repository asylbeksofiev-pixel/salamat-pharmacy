"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { cn } from "./cn";

type ToastTone = "success" | "info" | "error";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
  action?: { label: string; href: string };
}

const ToastContext = createContext<(text: string, tone?: ToastTone, action?: ToastItem["action"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

function Toast({ item, closeLabel, onRemove }: { item: ToastItem; closeLabel: string; onRemove: (id: number) => void }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (closing) onRemove(item.id);
      else setClosing(true);
    }, closing ? 200 : 4500);
    return () => window.clearTimeout(timer);
  }, [closing, item.id, onRemove]);

  return (
    <div
      data-closing={closing || undefined}
      inert={closing}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget && e.animationName === "sal-toast-out") onRemove(item.id);
      }}
      className={cn(
        "anim-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3 text-[0.95rem] text-white shadow-[var(--shadow-pop)]",
        item.tone === "error" ? "bg-accent-700" : item.tone === "info" ? "bg-ink" : "bg-brand-800",
      )}
    >
      <Icon name={item.tone === "error" ? "alert" : item.tone === "info" ? "info" : "checkCircle"} size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">{item.text}</span>
      {item.action ? (
        <a href={item.action.href} className="shrink-0 font-semibold underline underline-offset-2">
          {item.action.label}
        </a>
      ) : null}
      <button type="button" onClick={() => setClosing(true)} className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/15" aria-label={closeLabel}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (text: string, tone: ToastTone = "success", action?: ToastItem["action"]) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-2), { id, text, tone, action }]);
    },
    [],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        {items.map((item) => <Toast key={item.id} item={item} closeLabel={closeLabel} onRemove={remove} />)}
      </div>
    </ToastContext.Provider>
  );
}
