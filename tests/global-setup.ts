// Prepares the dedicated test database on every run: clean schema, migrations, reference data.
// Guarded: refuses to touch a database whose name does not contain "test".
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL || "postgresql://salamat@127.0.0.1:5433/salamat_test";
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) throw new Error(`Refusing to reset a database without "test" in its name: ${dbName}`);
  const env = { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: "", ADMIN_PASSWORD: "" };
  const run = (cmd: string, input?: string) => execSync(cmd, { env, stdio: input ? ["pipe", "pipe", "pipe"] : "pipe", input });
  run(`npx prisma db execute --url "${url}" --stdin`, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  run("npx prisma migrate deploy");
  run("npx tsx prisma/seed.ts");
  // Stand-in for the production catalogue table (not managed by Prisma migrations).
  run(`npx prisma db execute --url "${url}" --file tests/fixtures/pharmacy_products.sql`);
}
