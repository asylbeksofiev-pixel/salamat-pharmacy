import Image from "next/image";
import { cn } from "../ui/cn";
import { ProductPhoto } from "./ProductPhoto";
import { isBlobProductPhoto } from "@/lib/catalog-photos/blob-url";
import { isOpenFactsPhotoUrl } from "@/lib/catalog-photos/photo-hosts";

const optimisedHosts = new Set((process.env.IMAGE_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean));

/**
 * Neutral SALAMAT placeholder for products without a photo: the brand mark, softened, and a short label.
 * Never a stock photo — the visitor must not mistake it for the real packaging.
 */
export function ProductPlaceholder({ alt, label, className, compact = false, aspect = "aspect-square", radius = "rounded-[var(--radius-lg)]" }: { alt: string; label: string; className?: string; compact?: boolean; aspect?: string; radius?: string }) {
  return (
    <div
      className={cn("relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden bg-[linear-gradient(160deg,var(--color-surface),var(--color-brand-50))]", aspect, radius, className)}
      role="img"
      aria-label={label ? `${alt}. ${label}` : alt}
    >
      <span className={cn("relative block opacity-30 grayscale-[35%]", compact ? "w-[46%]" : "w-[30%] max-w-24")} aria-hidden="true">
        <Image src="/brand/salamat-mark.png" alt="" width={200} height={200} sizes="96px" className="h-auto w-full" />
      </span>
      {label && !compact ? <span className="px-3 text-center text-[0.72rem] leading-tight font-medium text-muted">{label}</span> : null}
    </div>
  );
}

/** Product photo from an allowed source, or a neutral placeholder. The photo always fits whole (object-contain). */
export function ProductImage({ src, alt, noImageLabel, className, sizes = "(max-width: 640px) 50vw, 280px", priority = false, compact = false, aspect = "aspect-square", radius = "rounded-[var(--radius-lg)]" }: { src: string | null; alt: string; noImageLabel: string; className?: string; sizes?: string; priority?: boolean; compact?: boolean; aspect?: string; radius?: string }) {
  if (!src) return <ProductPlaceholder alt={alt} label={noImageLabel} className={className} compact={compact} aspect={aspect} radius={radius} />;
  let host = "";
  try {
    host = new URL(src).hostname;
  } catch {
    /* invalid URL */
  }
  const optimised = (!!host && optimisedHosts.has(host)) || isBlobProductPhoto(src) || isOpenFactsPhotoUrl(src);
  // The whole package is always visible and never stretched: object-contain keeps the proportions. A photo served as
  // is (not optimised) uses scale-down, so a small picture is not enlarged into a blur; an optimised one is resized by
  // next/image to the box. A small inner margin keeps the package off the card edge.
  const imgClass = cn(
    optimised ? "object-contain" : "object-scale-down",
    "p-[5%] transition-transform duration-500 ease-[var(--ease-out-soft)] motion-safe:group-hover:scale-[1.03]",
  );
  // If the photo fails to load, the same box shows the placeholder instead of a broken-image icon.
  const fallback = <ProductPlaceholder alt={alt} label={noImageLabel} compact={compact} aspect="" radius="" className="absolute inset-0 h-full" />;
  return (
    <div className={cn("relative w-full overflow-hidden bg-white", aspect, radius, className)}>
      <ProductPhoto src={src} alt={alt} optimised={optimised} sizes={sizes} priority={priority} className={imgClass} fallback={fallback} />
    </div>
  );
}
