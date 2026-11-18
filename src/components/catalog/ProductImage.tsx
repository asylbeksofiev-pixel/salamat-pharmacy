import Image from "next/image";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

const optimisedHosts = new Set((process.env.IMAGE_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean));

/**
 * Catalogue photos in public Vercel Blob are published pre-sized by `npm run photos -- publish`:
 * catalog/products/<id>/v<n>-{400,800}.{webp,avif}. The stored URL is the 800 px WebP; the other variants share its prefix.
 */
const BLOB_PHOTO = /^(https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/catalog\/products\/\d+\/v\d+)-800\.webp$/i;

export function catalogPhotoSources(src: string) {
  const m = BLOB_PHOTO.exec(src);
  if (!m) return null;
  const base = m[1];
  return { avif: `${base}-400.avif 400w, ${base}-800.avif 800w`, webp: `${base}-400.webp 400w, ${base}-800.webp 800w`, fallback: `${base}-800.webp` };
}

/**
 * Product photo from an allowed source, or a neutral placeholder. Loads lazily unless `priority` (the main photo of a
 * product page). Photos keep their proportions inside a square frame (object-contain), so the package stays readable.
 */
export function ProductImage({ src, alt, noImageLabel, className, sizes = "(max-width: 640px) 50vw, 240px", priority = false }: { src: string | null; alt: string; noImageLabel: string; className?: string; sizes?: string; priority?: boolean }) {
  if (!src) {
    return (
      <div className={cn("flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-gradient-to-br from-surface to-brand-50/60 text-brand-300", className)} role="img" aria-label={`${alt}. ${noImageLabel}`}>
        <Icon name="box" size={40} strokeWidth={1.25} />
        <span className="text-[0.7rem] font-medium text-muted">{noImageLabel}</span>
      </div>
    );
  }
  const frame = cn("relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-white", className);
  const variants = catalogPhotoSources(src);
  if (variants) {
    // Already optimised files: the browser picks AVIF or WebP and the width it needs; no on-demand image optimisation.
    return (
      <div className={frame}>
        <picture>
          <source type="image/avif" srcSet={variants.avif} sizes={sizes} />
          <img
            src={variants.fallback}
            srcSet={variants.webp}
            sizes={sizes}
            alt={alt}
            width={800}
            height={800}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            className="absolute inset-0 size-full object-contain p-3"
          />
        </picture>
      </div>
    );
  }
  let host = "";
  try {
    host = new URL(src).hostname;
  } catch {
    /* invalid URL */
  }
  if (host && optimisedHosts.has(host)) {
    return (
      <div className={frame}>
        <Image src={src} alt={alt} fill sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} className="object-contain p-3" />
      </div>
    );
  }
  return (
    <div className={frame}>
      {/* eslint-disable-next-line @next/next/no-img-element -- host not configured for optimisation */}
      <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 size-full object-contain p-3" referrerPolicy="no-referrer" />
    </div>
  );
}
