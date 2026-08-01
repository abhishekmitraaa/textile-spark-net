// Phase 2 verification: drives the real app against the real Supabase project.
// No mocks — real auth (demo accounts), real RLS, real triggers.
import { chromium } from "playwright";

const BASE = "http://localhost:8081";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";
const BUYER_ID = "11111111-1111-1111-1111-111111111111";

const log = (...a) => console.log(...a);
const ok = (cond, label) => log(`${cond ? "PASS" : "FAIL"} :: ${label}`);

async function signInAs(page, label) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Dev account switcher" }).click();
  await page.getByRole("button", { name: label, exact: false }).click();
  await page.waitForTimeout(2500);
}

async function openThread(page, otherId) {
  await page.goto(`${BASE}/chats/${otherId}`, { waitUntil: "domcontentloaded" });
  // Composer is the signal the thread mounted.
  await page.waitForSelector('input[placeholder]', { timeout: 20000 });
  await page.waitForTimeout(2500);
}

const composer = (page) =>
  page.locator('input[placeholder="Message"], input[placeholder="Sending is paused while this chat is reviewed"]').first();

const bannerText = "This chat is under review for a possible policy violation";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") log("  [console.error]", m.text().slice(0, 200)); });

  // ── Test 1 — blocklisted term is rejected client-side ────────────────
  log("\n=== TEST 1: blocklisted term (buyer) ===");
  await signInAs(page, "Demo Buyer");
  await openThread(page, VENDOR_ID);

  const beforeCount = await page.locator(".space-y-2\\.5 > div").count();
  log(`  messages rendered before: ${beforeCount}`);

  const input = composer(page);
  await input.fill("can you send it on whatsapp instead");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(3000);

  const toastText = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
  log(`  toast: ${JSON.stringify(toastText)}`);
  ok(toastText.join(" ").toLowerCase().includes("not sent"), "rejection surfaced to the user");
  ok(
    toastText.join(" ").toLowerCase().includes("isn't allowed"),
    "copy names the blocklist as the cause",
  );

  const afterCount = await page.locator(".space-y-2\\.5 > div").count();
  log(`  messages rendered after: ${afterCount}`);
  ok(afterCount === beforeCount, "blocked message NOT added to the thread");

  const draftKept = await input.inputValue();
  log(`  draft retained: ${JSON.stringify(draftKept)}`);
  ok(draftKept === "can you send it on whatsapp instead", "draft preserved after rejection");

  await page.screenshot({ path: "shot-1-blocked.png" });

  // ── Test 2 — regex flag locks the thread (buyer view) ────────────────
  log("\n=== TEST 2: regex flag locks the thread (buyer view) ===");
  await input.fill("sure, call me on 9876543210 tomorrow");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(5000);

  const bannerVisibleBuyer = await page.getByText(bannerText).isVisible().catch(() => false);
  ok(bannerVisibleBuyer, "buyer sees the under-review banner");

  const inputDisabledBuyer = await composer(page).isDisabled();
  ok(inputDisabledBuyer, "buyer composer input disabled");

  const placeholderBuyer = await composer(page).getAttribute("placeholder");
  log(`  placeholder: ${JSON.stringify(placeholderBuyer)}`);
  ok(/paused/i.test(placeholderBuyer ?? ""), "placeholder replaced with explanation");

  const attachDisabled = await page.getByRole("button", { name: "Attach", exact: true }).isDisabled();
  ok(attachDisabled, "buyer attach button disabled");

  const micDisabled = await page.getByRole("button", { name: "Record audio" }).isDisabled().catch(() => "absent");
  const sendDisabled = await page.getByRole("button", { name: "Send", exact: true }).isDisabled().catch(() => "absent");
  log(`  mic disabled: ${micDisabled}, send disabled: ${sendDisabled}`);
  ok(micDisabled === true || sendDisabled === true, "buyer mic/send disabled");

  const callVisibleBuyer = await page.getByRole("button", { name: "Call", exact: true }).isVisible().catch(() => false);
  ok(!callVisibleBuyer, "buyer call button hidden");

  const monitoringBuyer = await page.getByText("Cosora will be monitoring the messages").isVisible().catch(() => false);
  ok(monitoringBuyer, "CHAT_MONITORING_NOTICE still rendered");

  await page.screenshot({ path: "shot-2-buyer-locked.png" });

  // ── Test 3 — same lock on the vendor side ────────────────────────────
  log("\n=== TEST 3: same thread, vendor view ===");
  await signInAs(page, "Demo Vendor");
  await openThread(page, BUYER_ID);

  const bannerVisibleVendor = await page.getByText(bannerText).isVisible().catch(() => false);
  ok(bannerVisibleVendor, "vendor sees the under-review banner");

  const inputDisabledVendor = await composer(page).isDisabled();
  ok(inputDisabledVendor, "vendor composer input disabled");

  const attachDisabledVendor = await page.getByRole("button", { name: "Attach", exact: true }).isDisabled();
  ok(attachDisabledVendor, "vendor attach button disabled");

  const callVisibleVendor = await page.getByRole("button", { name: "Call", exact: true }).isVisible().catch(() => false);
  ok(!callVisibleVendor, "vendor call button hidden");

  await page.screenshot({ path: "shot-3-vendor-locked.png" });

  await browser.close();
  log("\ndone");
})().catch((e) => { console.error("SCRIPT ERROR:", e); process.exit(1); });
