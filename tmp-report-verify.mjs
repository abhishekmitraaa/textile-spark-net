// Phase 2 verification, part 2: the ReportModal → submit_report() RPC path,
// plus a re-check that the disabled send/mic now LOOKS disabled.
import { chromium } from "playwright";

const BASE = "http://localhost:8081";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";

const log = (...a) => console.log(...a);
const ok = (c, label) => log(`${c ? "PASS" : "FAIL"} :: ${label}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Dev account switcher" }).click();
  await page.getByRole("button", { name: "Demo Buyer", exact: false }).click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/chats/${VENDOR_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder]', { timeout: 20000 });
  await page.waitForTimeout(2500);

  log("\n=== TEST 4: thread starts unlocked again ===");
  const startEnabled = await page.locator('input[placeholder="Message"]').isEnabled().catch(() => false);
  ok(startEnabled, "composer enabled before the report");
  const callBack = await page.getByRole("button", { name: "Call", exact: true }).isVisible().catch(() => false);
  ok(callBack, "call button back while active");

  log("\n=== TEST 5: report → submit_report() RPC ===");
  await page.getByRole("button", { name: "More" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await page.waitForTimeout(600);

  const modalUp = await page.getByText("Why are you reporting this?").isVisible().catch(() => false);
  ok(modalUp, "report modal opens");
  await page.screenshot({ path: "shot-4-report-reasons.png" });

  await page.getByRole("button", { name: /Scam, fraud or spam/ }).click();
  await page.waitForTimeout(4000);

  const thanks = await page.getByText("Thanks for your feedback").isVisible().catch(() => false);
  ok(thanks, "confirmation shown after the RPC succeeded");
  await page.screenshot({ path: "shot-5-report-done.png" });

  // Close the modal; the thread underneath should now be locked.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForTimeout(2000);

  const bannerNow = await page
    .getByText("This chat is under review for a possible policy violation")
    .isVisible()
    .catch(() => false);
  ok(bannerNow, "thread locks in-place after reporting (no reload)");

  const inputNow = page.locator('input[placeholder="Sending is paused while this chat is reviewed"]').first();
  ok(await inputNow.isDisabled(), "composer disabled after reporting");

  // The send/mic opacity fix: disabled must also LOOK disabled.
  const micOpacity = await page
    .getByRole("button", { name: "Record audio" })
    .evaluate((el) => getComputedStyle(el).opacity)
    .catch(() => "n/a");
  log(`  mic computed opacity: ${micOpacity}`);
  ok(parseFloat(micOpacity) < 0.9, "disabled mic is visibly dimmed");

  await page.screenshot({ path: "shot-6-after-report.png" });

  await browser.close();
  log("\ndone");
})().catch((e) => { console.error("SCRIPT ERROR:", e); process.exit(1); });
