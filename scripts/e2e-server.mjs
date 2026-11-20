// Starts the production server for end-to-end tests on a dedicated database with the demo catalogue.
// Guarded: the database name must contain "test".
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const url = process.env.E2E_DATABASE_URL || "postgresql://salamat@127.0.0.1:5433/salamat_e2e_test";
const dbName = new URL(url).pathname.slice(1);
if (!/test/i.test(dbName)) throw new Error(`Refusing to reset ${dbName}: name must contain "test"`);
const port = process.env.E2E_PORT || "3100";
const env = { ...process.env, DATABASE_URL: url, ADMIN_EMAIL: "", ADMIN_PASSWORD: "", SHOW_DEMO_DATA: "true", APP_URL: `http://localhost:${port}`, APP_SECRET: "e2e-secret", NODE_ENV: "production" };
const run = (cmd, input) => execSync(cmd, { env: { ...env, NODE_ENV: "development" }, stdio: input ? ["pipe", "inherit", "inherit"] : "inherit", input });

run(`npx prisma db execute --url "${url}" --stdin`, "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts");
run(`npx prisma db execute --url "${url}" --file tests/fixtures/pharmacy_products.sql`);
run("npx tsx --conditions=react-server scripts/seed-demo.ts");
// The build must run with NODE_ENV=production: with "development" Next.js fails to prerender /_global-error.
if (!existsSync(".next/BUILD_ID")) execSync("npx next build", { env, stdio: "inherit" });
const child = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit" });
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => process.exit(code ?? 0));
