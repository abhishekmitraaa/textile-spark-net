import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The sourcing loop through the real UI — Master Prompt 12, Part F.
 *
 * Nothing in tests/ covered the product's core loop: a buyer's request reaches
 * a vendor, the vendor quotes it in the dashboard, the buyer accepts it. Nor
 * the three rules fixed on 2026-09-16/23 around it, each of which was a real
 * bug before:
 *   * the dashboard's "N/10 leads used" is the number the cap enforces
 *     (findings §2: shown 7/10, refused as "already quoted 171");
 *   * a request addressed to the vendor is answered even at the cap
 *     (Master Prompt 12 Part A);
 *   * a closed request accepts no quote, and the vendor is told why
 *     (decided 2026-09-23).
 *
 * FIXTURES: the synthetic load-test population, not a third fixture set.
 *   loadtest-buyer-1    creates the requests (through the API, as the app's
 *                       createRfq/createTargetedQuoteRequest would) and accepts
 *                       in My Quotes (through the UI);
 *   loadtest-vendor-64  free plan with headroom: quotes an open request;
 *   loadtest-vendor-3   free plan held at its 10-lead cap (topped up with
 *                       [LOADTEST] quotes if a new month reset it).
 * Every row is [LOADTEST]-tagged and removed by the synthetic-data cleanup.
 * Needs LOADTEST_PASSWORD in .env and `npm run dev` on :8080.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const PASSWORD = optionalCredential("LOADTEST_PASSWORD");
test.skip(!PASSWORD, "set LOADTEST_PASSWORD in .env (see .env.example)");

const BUYER = "loadtest-buyer-1@cosora.test";
const OPEN_VENDOR = "loadtest-vendor-64@cosora.test";
const CAPPED_VENDOR = "loadtest-vendor-3@cosora.test";
// Letters only: a run tag must never match the chat phone-number pattern.
const RUN = Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");

interface Session { db: SupabaseClient; id: string; session: unknown }
async function signIn(email: string): Promise<Session> {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { db, id: data.user.id, session: data.session };
}
async function contextFor(browser: Browser, s: Session): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string),
    [STORAGE_KEY, JSON.stringify(s.session)] as const);
  return ctx;
}
async function leadsUsed(s: Session): Promise<{ used: number; cap: number }> {
  const { data, error } = await s.db.rpc("get_vendor_plan", { v: s.id });
  if (error) throw error;
  return { used: data.usage.leads_used, cap: data.limits.leads_per_month };
}
async function createRequest(buyer: Session, title: string, targetVendor: string | null): Promise<string> {
  const { data, error } = await buyer.db.from("rfqs").insert({
    buyer_id: buyer.id, vendor_id: targetVendor, title, product_name: title, quantity: 250,
    description: `[LOADTEST] Playwright sourcing loop (Master Prompt 12) run ${RUN}`, status: "active",
  }).select("id").single();
  if (error) throw error;
  return data.id;
}
async function quoteRow(s: Session, rfqId: string) {
  const { data } = await s.db.from("quotes").select("id, status, price_per_unit").eq("rfq_id", rfqId).eq("vendor_id", s.id);
  return data ?? [];
}
/** Hold a vendor at exactly its cap with [LOADTEST] quotes, whatever the month. */
async function holdAtCap(v: Session): Promise<void> {
  let { used, cap } = await leadsUsed(v);
  while (used < cap) {
    const { data: mine } = await v.db.from("quotes").select("rfq_id").eq("vendor_id", v.id);
    const done = new Set((mine ?? []).map((q) => q.rfq_id));
    const { data: open } = await v.db.from("rfqs").select("id").is("vendor_id", null).eq("status", "active")
      .like("title", "[LOADTEST]%").limit(300);
    const next = (open ?? []).find((r) => !done.has(r.id));
    if (!next) throw new Error("no [LOADTEST] RFQ left to top the capped vendor up with");
    const { error } = await v.db.from("quotes").insert({ rfq_id: next.id, vendor_id: v.id, price_per_unit: 1, comment: "[LOADTEST] Playwright cap fixture" });
    if (error) throw error;
    ({ used, cap } = await leadsUsed(v));
  }
}
/** The Buyer Requirements header prints "N/cap leads used" — once per page. */
async function shownLeads(page: Page): Promise<string> {
  return (await page.getByText(/^\d+\/\d+ leads used$/).innerText()).trim();
}
/** A request card, found by this run's unique title (cards are div.rounded-xl;
 *  their section wrappers are rounded-2xl, so they never match). */
const requestCard = (page: Page, title: string) => page.locator("div.rounded-xl", { hasText: title }).first();

test.describe.serial("MP12 sourcing loop: request → quote → accept, and the rules around it", () => {
  let buyer: Session, openVendor: Session, capped: Session;
  const openTitle = `[LOADTEST] PW open request ${RUN}`;
  let openRfq = "";

  test.beforeAll(async () => {
    buyer = await signIn(BUYER);
    openVendor = await signIn(OPEN_VENDOR);
    capped = await signIn(CAPPED_VENDOR);
  });

  test("F1 a vendor quotes an open request, and the dashboard counter is the enforced count", async ({ browser }) => {
    const before = await leadsUsed(openVendor);
    test.skip(before.used >= before.cap, `${OPEN_VENDOR} has no lead headroom this period`);
    openRfq = await createRequest(buyer, openTitle, null);

    const ctx = await contextFor(browser, openVendor);
    const page = await ctx.newPage();
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Buyer Requirements" })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => shownLeads(page), { timeout: 20_000 }).toBe(`${before.used}/${before.cap} leads used`);

    const card = requestCard(page, openTitle);
    await card.getByRole("button", { name: "Submit Quote" }).click();
    await card.getByPlaceholder("Price / unit (₹)").fill("185");
    await card.getByPlaceholder("MOQ").fill("200");
    await card.getByPlaceholder("Lead time (e.g. 20 days)").fill("Twenty days");
    await card.getByRole("button", { name: "Send Quote" }).click();
    await expect(page.getByText("Quote submitted", { exact: true }).first()).toBeVisible();

    // The row landed, the dashboard moved by exactly one, and it agrees with the server.
    await expect.poll(async () => (await quoteRow(openVendor, openRfq)).length).toBe(1);
    const after = await leadsUsed(openVendor);
    expect(after.used).toBe(before.used + 1);
    await expect.poll(() => shownLeads(page), { timeout: 20_000 }).toBe(`${after.used}/${after.cap} leads used`);
    await ctx.close();
  });

  test("F2 the buyer sees that quote in My Quotes and accepts it", async ({ browser }) => {
    test.skip(!openRfq, "F1 did not create a quote");
    const ctx = await contextFor(browser, buyer);
    const page = await ctx.newPage();
    await page.goto("/requirement/my-quotes");
    await page.getByRole("button", { name: new RegExp(`PW open request ${RUN}`) }).click();
    await expect(page.getByRole("heading", { name: "Quotes Received" })).toBeVisible();
    await page.getByRole("button", { name: /^Accept( Quote)?$/ }).first().click();
    await expect(page.getByText("Quote Accepted 🎉")).toBeVisible();
    await expect.poll(async () => (await quoteRow(openVendor, openRfq))[0]?.status).toBe("accepted");
    await ctx.close();
  });

  test("F3 at the cap: open requests are gated, a request addressed to the vendor is still answered", async ({ browser }) => {
    await holdAtCap(capped);
    const { used, cap } = await leadsUsed(capped);
    const title = `[LOADTEST] PW direct request ${RUN}`;
    const rfq = await createRequest(buyer, title, capped.id);

    const ctx = await contextFor(browser, capped);
    const page = await ctx.newPage();
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Buyer Requirements" })).toBeVisible({ timeout: 30_000 });
    // §2 regression, UI side: what the vendor is shown is what is enforced.
    await expect.poll(() => shownLeads(page), { timeout: 20_000 }).toBe(`${used}/${cap} leads used`);
    await expect(page.getByText("Monthly lead limit reached — upgrade to keep quoting")).toBeVisible();
    await expect(page.getByRole("link", { name: "Upgrade to quote" }).first()).toBeVisible();

    await expect(page.getByRole("heading", { name: "Direct Quote Requests" })).toBeVisible();
    const card = requestCard(page, title);
    await card.getByRole("button", { name: "Send Quote" }).click();
    await card.getByPlaceholder("Price / unit (₹)").fill("210");
    await card.getByRole("button", { name: "Send Quote" }).click();
    await expect(page.getByText("Quote sent", { exact: true }).first()).toBeVisible();

    await expect.poll(async () => (await quoteRow(capped, rfq)).length).toBe(1);
    expect((await leadsUsed(capped)).used).toBe(used); // a direct reply does not consume a lead
    await ctx.close();
  });

  test("F4 a request closed while the vendor is replying is refused, with the reason on screen", async ({ browser }) => {
    const title = `[LOADTEST] PW closing request ${RUN}`;
    const rfq = await createRequest(buyer, title, capped.id);

    const ctx = await contextFor(browser, capped);
    const page = await ctx.newPage();
    await page.goto("/leads");
    await expect(page.getByRole("heading", { name: "Direct Quote Requests" })).toBeVisible({ timeout: 30_000 });
    const card = requestCard(page, title);
    await card.getByRole("button", { name: "Send Quote" }).click();
    await card.getByPlaceholder("Price / unit (₹)").fill("210");

    // The buyer closes the request while the form is open.
    const { error } = await buyer.db.from("rfqs").update({ status: "closed" }).eq("id", rfq);
    expect(error).toBeNull();

    await card.getByRole("button", { name: "Send Quote" }).click();
    await expect(page.getByText("Couldn't send quote")).toBeVisible();
    await expect(page.getByText("This request is closed and is no longer accepting quotes.")).toBeVisible();
    expect(await quoteRow(capped, rfq)).toHaveLength(0);
    await ctx.close();
  });
});
