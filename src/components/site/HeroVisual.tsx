"use client";
// Decorative SALAMAT mark in the hero. Not a link and not focusable (aria-hidden).
// * Pointer over the visual: the rings drift a few pixels towards the pointer and the mark tilts slightly.
// * Drag (mouse or finger): the mark turns with the pointer; on release it eases back to its place.
//   touch-action: pan-y keeps vertical page scrolling on phones — only a sideways drag turns the mark.
// * prefers-reduced-motion: no reaction at all, a calm static composition.
// Values are written to CSS variables on the root element; transitions live in globals.css (.sal-logo-*).
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

const MAX_DRIFT = 1; // normalised (-1..1), scaled in CSS
const MAX_TURN = 70; // degrees while dragging

export function HeroVisual({ children, className }: { children?: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let drag: { id: number; startAngle: number; cx: number; cy: number } | null = null;
    const set = (vars: Record<string, string>) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
      });
    };
    const reset = () => {
      el.removeAttribute("data-dragging");
      set({ "--hx": "0", "--hy": "0", "--turn": "0deg" });
    };
    const centre = () => {
      const r = el.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r };
    };
    const onMove = (e: PointerEvent) => {
      if (reduce.matches) return;
      const { cx, cy, r } = centre();
      if (drag && e.pointerId === drag.id) {
        const angle = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI;
        let delta = angle - drag.startAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        set({ "--turn": `${Math.max(-MAX_TURN, Math.min(MAX_TURN, delta)).toFixed(1)}deg` });
        return;
      }
      if (e.pointerType !== "mouse") return; // hover drift only for a real pointer
      const hx = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, (e.clientX - cx) / (r.width / 2)));
      const hy = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, (e.clientY - cy) / (r.height / 2)));
      set({ "--hx": hx.toFixed(3), "--hy": hy.toFixed(3) });
    };
    const onDown = (e: PointerEvent) => {
      if (reduce.matches || e.button !== 0) return;
      const { cx, cy } = centre();
      drag = { id: e.pointerId, startAngle: (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI, cx, cy };
      el.setAttribute("data-dragging", "");
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture unavailable: the drag still works while the pointer stays over the visual */
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        el.removeAttribute("data-dragging");
        set({ "--turn": "0deg" });
      }
    };
    const onLeave = (e: PointerEvent) => {
      if (!drag && e.pointerType === "mouse") reset();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", onUp);
    el.addEventListener("pointerleave", onLeave);
    reduce.addEventListener("change", reset);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("lostpointercapture", onUp);
      el.removeEventListener("pointerleave", onLeave);
      reduce.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div ref={root} className={`sal-logo relative aspect-square select-none ${className ?? ""}`} aria-hidden="true">
      <div className="sal-logo-glow absolute inset-[-6%] rounded-full" />
      <div className="sal-logo-ring-outer absolute inset-[1%] rounded-full border-2 border-dashed border-brand-200/80" />
      <div className="sal-logo-ring absolute inset-[7%] rounded-full bg-brand-100/80" />
      <div className="sal-logo-disc absolute inset-[17%] rounded-full bg-white shadow-[0_30px_80px_rgb(0_122_61/0.2),inset_0_-8px_24px_rgb(0_122_61/0.06)]" />
      <div className="sal-logo-mark absolute inset-[27%]">
        <Image src="/brand/salamat-mark.png" alt="" fill sizes="(max-width: 1024px) 140px, 280px" className="pointer-events-none object-contain" draggable={false} priority />
      </div>
      {children}
    </div>
  );
}
