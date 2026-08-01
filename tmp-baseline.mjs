import { chromium } from "playwright";
const BASE = "http://localhost:8081";
const ok = (c, l) => console.log(`${c ? "PASS" : "FAIL"} :: ${l}`);
const BUBBLES = 'div[class~="space-y-2.5"] > div';

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Dev account switcher" }).click();
  await page.getByRole("button", { name: "Demo Buyer", exact: false }).click();
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/chats/22222222-2222-2222-2222-222222222222`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input[placeholder]", { timeout: 20000 });
  await page.waitForTimeout(2500);

  console.log("\n=== TEST 7: baseline, no moderation rules configured ===");
  ok(!(await page.getByText("This chat is under review").isVisible().catch(() => false)), "no banner");
  ok(await page.locator('input[placeholder="Message"]').isEnabled(), "composer enabled");
  ok(await page.getByRole("button", { name: "Call", exact: true }).isVisible(), "call button present");
  ok(await page.getByRole("button", { name: "Attach", exact: true }).isEnabled(), "attach enabled");

  const before = await page.locator(BUBBLES).count();
  await page.locator('input[placeholder="Message"]').fill("Please share the swatch card.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(3500);
  const after = await page.locator(BUBBLES).count();
  const draft = await page.locator('input[placeholder="Message"]').inputValue();
  ok(after === before + 1, `ordinary message sends (${before} -> ${after})`);
  ok(draft === "", "draft cleared on success");
  ok(await page.getByText("Cosora will be monitoring the messages").isVisible(), "monitoring notice rendered");

  await page.screenshot({ path: "shot-8-baseline.png" });
  await b.close();
  console.log("\ndone");
})().catch((e) => { console.error("SCRIPT ERROR:", e); process.exit(1); });
