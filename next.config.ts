import type { NextConfig } from "next";

// Hosts allowed for optimised product images (comma-separated), e.g. "cdn.salamat.kz".
// Images from other hosts are still shown, but without next/image optimisation.
const imageHosts = (process.env.IMAGE_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Content Security Policy for production. Next.js injects inline bootstrap scripts, hence 'unsafe-inline';
// no third-party scripts are loaded. The pharmacy map (Leaflet, bundled) loads OpenStreetMap tiles as images.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
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
    remotePatterns: [
      // Product photos in the public Vercel Blob store (catalog/products/<id>/v<n>-<w>.<webp|avif>). They are published
      // pre-sized and rendered with <picture> without on-demand optimisation; the pattern keeps next/image usable for them.
      { protocol: "https" as const, hostname: "*.public.blob.vercel-storage.com", pathname: "/catalog/**", search: "" },
      ...imageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
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
