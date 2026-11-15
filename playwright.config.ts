import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT || "3100";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "off", locale: "ru-RU", timezoneId: "Asia/Almaty" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${port}/robots.txt`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
  },
});
