import { defineConfig, devices } from "@playwright/test";

/**
 * Help & Support launch gate (plan P7): the specs in tests/local/ run ONLY against a
 * local Supabase stack, never production. scripts/local-stack/README.md says how to start
 * the stack, load the schema and start both apps against it:
 *     buyer app   http://localhost:8090   (VITE_SUPABASE_URL = the local API)
 *     admin panel http://localhost:5184
 * tests/local/stack.ts refuses to run when the stack it is given isn't on this machine.
 *
 *     npx playwright test -c playwright.local.config.ts
 */
export default defineConfig({
  testDir: "./tests/local",
  // One shared local database; the specs build on each other's state only through the
  // fixtures they create themselves, but realtime and the rollout flag are global.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-local", open: "never" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/local/global-setup.ts",
  use: {
    baseURL: process.env.LOCAL_BUYER_URL ?? "http://localhost:8090",
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
