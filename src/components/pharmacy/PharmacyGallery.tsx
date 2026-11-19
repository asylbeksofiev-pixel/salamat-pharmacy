"use client";
// Photos of one branch (only ones with confirmed rights). Native swipe with scroll-snap, dot buttons to jump,
// no autoplay. The credit of the visible photo is shown under it (some licences require attribution).
// With prefers-reduced-motion the jump is instant instead of a smooth scroll.
import { useRef, useState } from "react";
import { fmt } from "@/lib/i18n/config";
import { useSite } from "../site/SiteProvider";
import { cn } from "../ui/cn";

export interface GalleryPhoto {
  url: string;
  kind: "EXTERIOR" | "INTERIOR";
  source: string;
  license: string;
  sourceUrl: string | null;
}

export function PharmacyGallery({ photos, address, className, aspect = "aspect-[16/10]" }: { photos: GalleryPhoto[]; address: string; className?: string; aspect?: string }) {
  const { t } = useSite();
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const shown = photos.map((p, i) => ({ ...p, i })).filter((p) => !failed.has(p.i));
  if (!shown.length) return null;
  const active = shown[Math.min(current, shown.length - 1)];
  const go = (index: number) => {
    const el = track.current;
    if (!el) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };
  return (
    <figure className={className}>
      <div className={cn("relative overflow-hidden bg-surface", aspect)}>
        <div
          ref={track}
          className="sal-gallery absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          onScroll={(e) => setCurrent(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        >
          {shown.map((p, n) => (
            // eslint-disable-next-line @next/next/no-img-element -- photos come from hosts configured by staff
            <img
              key={p.url}
              src={p.url}
              alt={`${address} — ${p.kind === "EXTERIOR" ? t.pharmacy.photoExterior : t.pharmacy.photoInterior}${shown.length > 1 ? ` (${fmt(t.pdp.photoOf, { n: n + 1, total: shown.length })})` : ""}`}
              loading={n === 0 ? "eager" : "lazy"}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailed((s) => new Set(s).add(p.i))}
              className="size-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        {shown.length > 1 ? (
          <div className="absolute inset-x-0 bottom-1.5 flex justify-center">
            <div className="flex items-center rounded-full bg-ink/35 px-1 backdrop-blur-sm">
              {shown.map((p, n) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => go(n)}
                  aria-label={fmt(t.pdp.photoOf, { n: n + 1, total: shown.length })}
                  aria-current={n === current ? "true" : undefined}
                  className="grid size-7 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
                >
                  <span className={cn("block h-2 rounded-full bg-white transition-[width,opacity] duration-200", n === current ? "w-4 opacity-100" : "w-2 opacity-60")} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <figcaption className="mt-1.5 truncate px-0.5 text-[0.72rem] text-muted">
        {t.items.photoCredit}{" "}
        {active.sourceUrl ? (
          <a href={active.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand-700">
            {active.source}
          </a>
        ) : (
          active.source
        )}
        , {active.license}
      </figcaption>
    </figure>
  );
}
