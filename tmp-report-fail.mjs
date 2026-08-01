// Verifies the ReportModal error branch: when submit_report() fails, the user
// must see an error and must NOT see "Thanks for your feedback".
import { chromium } from "playwright";
const BASE = "http://localhost:8081";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";
const ok = (c, l) => console.log(`${c ? "PASS" : "FAIL"} :: ${l}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Dev account switcher" }).click();
  await page.getByRole("button", { name: "Demo Buyer", exact: false }).click();
  await page.waitForTimeout(2500);

  // Force the RPC to fail, leaving everything else real.
  await page.route("**/rest/v1/rpc/submit_report*", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' }));

  await page.goto(`${BASE}/chats/${VENDOR_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder]', { timeout: 20000 });
  await page.waitForTimeout(2500);

  console.log("\n=== TEST 6: report RPC fails ===");
  await page.getByRole("button", { name: "More" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Scam, fraud or spam/ }).click();
  await page.waitForTimeout(3000);

  const errShown = await page.getByText("We couldn't submit your report").isVisible().catch(() => false);
  ok(errShown, "error state surfaced");
  const thanks = await page.getByText("Thanks for your feedback").isVisible().catch(() => false);
  ok(!thanks, "confirmation NOT shown on failure");
  const reasonsStill = await page.getByText("Why are you reporting this?").isVisible().catch(() => false);
  ok(reasonsStill, "user can retry (reason list still there)");

  await page.screenshot({ path: "shot-7-report-error.png" });
  await browser.close();
  console.log("\ndone");
})().catch((e) => { console.error("SCRIPT ERROR:", e); process.exit(1); });
