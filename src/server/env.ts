// Server-side configuration. Secrets come only from environment variables (see .env.example).
import "server-only";

function bool(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** HMAC key for hashing client IPs (rate limits) and other non-reversible tokens. */
  appSecret:
    process.env.APP_SECRET ||
    (isProd && process.env.NEXT_PHASE !== "phase-production-build" ? "" : "dev-only-insecure-secret-change-me"),
  /** Shows demo-source products publicly and the demo banner. Never enable in production. */
  showDemoData: bool(process.env.SHOW_DEMO_DATA),
  allowIndexing: bool(process.env.ALLOW_INDEXING),
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "",
  },
  operatorEmails: (process.env.OPERATOR_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE ? bool(process.env.COOKIE_SECURE) : isProd,
  /**
   * Address search for "nearest pharmacy" (server only, never sent to the browser).
   * YANDEX_GEOCODER_API_KEY: Yandex HTTP Geocoder; without it the public OpenStreetMap Nominatim service
   * (no key, light use only: 1 request per second, cached). YANDEX_SUGGEST_API_KEY: Yandex Geosuggest
   * (address suggestions while typing). GEOCODER=off disables the search.
   */
  geocoder: {
    mode: (process.env.GEOCODER || "").toLowerCase(),
    yandexGeocoderKey: process.env.YANDEX_GEOCODER_API_KEY || "",
    yandexSuggestKey: process.env.YANDEX_SUGGEST_API_KEY || "",
  },
};

export function assertSecretConfigured() {
  if (!env.appSecret) throw new Error("APP_SECRET is not configured");
}
