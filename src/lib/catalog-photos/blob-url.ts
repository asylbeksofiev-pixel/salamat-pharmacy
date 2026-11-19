// Product photos stored by scripts/catalog-photos/internet.ts in SALAMAT's public Vercel Blob store:
// https://<store-id>.public.blob.vercel-storage.com/products/<product id>/<sha256>.<ext>
// The same rule is allowed for next/image in next.config.ts (images.remotePatterns).

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export function isBlobProductPhoto(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname) && !u.port && u.pathname.startsWith("/products/") && !u.search;
  } catch {
    return false;
  }
}

/** Object name in the store: one folder per product id, the file named by its content (never overwritten). */
export function blobPathname(productId: string, sha256: string, ext: string): string {
  if (!/^[1-9]\d{0,17}$/.test(productId)) throw new Error(`bad product id: ${productId}`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`bad sha256: ${sha256}`);
  if (!/^(jpg|png|webp|avif)$/.test(ext)) throw new Error(`bad extension: ${ext}`);
  return `products/${productId}/${sha256}.${ext}`;
}
