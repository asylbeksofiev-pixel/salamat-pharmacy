// Creates a small local copy of public.pharmacy_products for development (128 sample rows).
// Refuses to run unless DATABASE_URL points to localhost — production already has the real table.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

for (const line of (() => { try { return readFileSync(".env", "utf8").split("\n"); } catch { return []; } })()) {
  const m = line.match(/^DATABASE_URL="?([^"]+)"?$/);
  if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
}
const url = process.env.DATABASE_URL || "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error("Refusing: DATABASE_URL is not a local database. The production table must not be touched.");
  process.exit(1);
}
execSync(`npx prisma db execute --url "${url}" --file tests/fixtures/pharmacy_products.sql`, { stdio: "inherit" });
console.log("Local public.pharmacy_products is ready.");
