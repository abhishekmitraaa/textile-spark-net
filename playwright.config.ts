import { defineConfig, devices } from "@playwright/test";

/**
 * There was no config in this repo until now — `tests/new-arrivals.spec.ts`
 * compensated by probing ports 8080–8085 itself and failing if none answered.
 * That works for one spec and stops working the moment a second one needs a
 * different base URL, a screenshot directory, or an auth fixture.
 *
 * `webServer` is deliberately NOT used. Both apps in this workspace are
 * long-running dev servers a human usually already has open, and letting
 * Playwright start and kill them makes a test run stomp on that. Start them
 * yourself:
 *     textile-spark-net:  npm run dev          (localhost:8080)
 *     Cosora-Admin:       npm run dev          (localhost:5174)
 *
 * Screenshots land in `test-results/screenshots/` and are referenced by path
 * from documentation/test.md — evidence has to be a file someone can open, not
 * a description of a file.
 */
export default defineConfig({
  testDir: "./tests",
  // The chat specs drive two browser contexts against one shared database and
  // flip moderation state on fixture rows. Running them in parallel would have
  // one spec's suspension land in the middle of another's assertion.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "test-results/html", open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BUYER_APP_URL ?? "http://localhost:8080",
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
