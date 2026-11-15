import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!env.allowIndexing) {
    // Staging / pre-launch: nothing is indexed until ALLOW_INDEXING=true.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const privatePaths = ["/admin", "/api/", "/cart", "/checkout", "/order/", "/favorites", "/search", "/kk/cart", "/kk/checkout", "/kk/order/", "/kk/favorites", "/kk/search"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privatePaths }],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
