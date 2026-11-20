import type { NextConfig } from "next";

// Hosts allowed for optimised product images (comma-separated), e.g. "cdn.salamat.kz".
// Images from other hosts are still shown, but without next/image optimisation.
const imageHosts = (process.env.IMAGE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Content Security Policy for production. Next.js injects inline bootstrap scripts, hence 'unsafe-inline';
// no third-party scripts are loaded. The pharmacy map is the official Yandex Maps widget in an iframe (frame-src).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://yandex.kz https://yandex.ru",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // 75 is the default; 90 is used by the home page promo banners (large pictures with smooth gradients show
    // visible banding and blur at 75).
    qualities: [75, 90],
    remotePatterns: [
      ...imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
      // Product photos stored by scripts/catalog-photos/internet.ts in the project's public Vercel Blob store
      // (<store-id>.public.blob.vercel-storage.com/products/<product id>/<sha256>.<ext>). Only that folder, no query.
      { protocol: "https" as const, hostname: "*.public.blob.vercel-storage.com", pathname: "/products/**", search: "" },
      // Open Facts product photos linked directly from image_url (CC BY-SA; see src/lib/catalog-photos/photo-hosts.ts).
      // Optimised by the site: the originals are several thousand pixels wide.
      ...["images.openfoodfacts.org", "images.openbeautyfacts.org", "images.openproductsfacts.org"].map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/images/products/**",
        search: "",
      })),
    ],
  },
  serverExternalPackages: ["exceljs", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default nextConfig;
