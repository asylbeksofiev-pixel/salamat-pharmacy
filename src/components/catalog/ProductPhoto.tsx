"use client";
// A product photo that falls back to the SALAMAT placeholder when the image cannot be loaded
// (dead link, blocked host). An error that happened before hydration is caught too: on mount the image is
// checked for `complete && naturalWidth === 0`. The box keeps its size, so nothing jumps.
// A bubbling PHOTO_FAILED_EVENT lets a surrounding gallery drop its zoom button and photo credit.
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const PHOTO_FAILED_EVENT = "salamat:photo-failed";

export function ProductPhoto({ src, alt, optimised, sizes, priority, className, fallback }: { src: string; alt: string; optimised: boolean; sizes: string; priority: boolean; className: string; fallback: ReactNode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) {
      el.dispatchEvent(new CustomEvent(PHOTO_FAILED_EVENT, { bubbles: true }));
      setFailedSrc(src);
    }
  }, [src]);
  if (failedSrc === src) return <>{fallback}</>;
  const onError = () => {
    img.current?.dispatchEvent(new CustomEvent(PHOTO_FAILED_EVENT, { bubbles: true }));
    setFailedSrc(src);
  };
  if (optimised) return <Image ref={img} src={src} alt={alt} fill sizes={sizes} priority={priority} className={className} onError={onError} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- host not configured for optimisation
    <img ref={img} src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" className={`absolute inset-0 size-full ${className}`} referrerPolicy="no-referrer" onError={onError} />
  );
}
