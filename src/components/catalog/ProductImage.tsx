import Image from "next/image";
import { Icon } from "../icons";
import { cn } from "../ui/cn";

const optimisedHosts = new Set((process.env.IMAGE_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean));

/** Product photo from an allowed source, or a neutral placeholder. */
export function ProductImage({ src, alt, noImageLabel, className, sizes = "(max-width: 640px) 50vw, 240px", priority = false }: { src: string | null; alt: string; noImageLabel: string; className?: string; sizes?: string; priority?: boolean }) {
  if (!src) {
    return (
      <div className={cn("flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-gradient-to-br from-surface to-brand-50/60 text-brand-300", className)} role="img" aria-label={`${alt}. ${noImageLabel}`}>
        <Icon name="box" size={40} strokeWidth={1.25} />
        <span className="text-[0.7rem] font-medium text-muted">{noImageLabel}</span>
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
      <div className={cn("relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-white", className)}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-contain p-3" />
      </div>
    );
  }
  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-[var(--radius-lg)] bg-white", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- host not configured for optimisation */}
      <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 size-full object-contain p-3" referrerPolicy="no-referrer" />
    </div>
  );
}
