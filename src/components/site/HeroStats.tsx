"use client";
// Home page figures. The cards rise in once when they first come into view; numbers count up to the real value
// (the server renders the real value, so it is correct without JavaScript and for screen readers).
// With prefers-reduced-motion the final values are shown without movement.
import { useEffect, useRef, useState } from "react";
import { cn } from "../ui/cn";

export interface HeroStat {
  /** Visually hidden term (what the figure is). */
  term: string;
  /** Number to count to, or a short text (e.g. "GPP") that only fades in. */
  value: number | string;
  /** Counting starts here (defaults to 0). */
  from?: number;
  /** Group thousands (off for years). */
  grouping?: boolean;
  caption: string;
}

const DURATION_MS = 900;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export function HeroStats({ stats, locale, className }: { stats: HeroStat[]; locale: string; className?: string }) {
  const ref = useRef<HTMLDListElement>(null);
  const [visible, setVisible] = useState(false);
  // null: not started (shows the real value); 0…1 while counting.
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = () => {
      setVisible(true);
      if (still) return;
      const t0 = performance.now();
      const tick = (now: number) => {
        const x = Math.min(1, (now - t0) / DURATION_MS);
        setProgress(x);
        if (x < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    if (!("IntersectionObserver" in window)) {
      frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    // Once only: scrolling back and forth does not replay it.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          start();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const shown = (s: HeroStat) => {
    if (typeof s.value !== "number") return s.value;
    const from = s.from ?? 0;
    const v = progress === null || progress >= 1 ? s.value : Math.round(from + (s.value - from) * easeOut(progress));
    return s.grouping === false ? String(v) : v.toLocaleString(locale);
  };
  const final = (s: HeroStat) => (typeof s.value === "number" ? (s.grouping === false ? String(s.value) : s.value.toLocaleString(locale)) : s.value);

  return (
    <dl ref={ref} className={cn("grid grid-cols-3 gap-3", className)}>
      {stats.map((s, i) => (
        <div
          key={s.term}
          className={cn("sal-reveal rounded-[var(--radius-lg)] bg-white p-3 shadow-[var(--shadow-card)]", visible && "is-visible")}
          style={{ transitionDelay: visible ? `${i * 90}ms` : undefined }}
        >
          <dt className="sr-only">{s.term}</dt>
          <dd className="text-2xl font-extrabold text-brand-700 tabular-nums">
            {/* The real value reserves the width, so counting never shifts the layout. */}
            <span className="grid">
              <span className="invisible col-start-1 row-start-1" aria-hidden="true">
                {final(s)}
              </span>
              <span className={cn("col-start-1 row-start-1", typeof s.value !== "number" && "sal-reveal-text", visible && "is-visible")} style={{ transitionDelay: visible ? `${i * 90 + 120}ms` : undefined }}>
                {shown(s)}
              </span>
            </span>
          </dd>
          <dd className="text-xs leading-tight text-muted">{s.caption}</dd>
        </div>
      ))}
    </dl>
  );
}
