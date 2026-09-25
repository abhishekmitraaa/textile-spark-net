import { test, expect, type Browser } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient, type Session } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Andy's Seller Registration and Subscription FAQs, as seeded (Phase 24 of the My
 * Profile brief, 2026-09-25; Phase 9 Q4). Read-only.
 *
 * Migration 20260925075432_faqs_seed_seller_registration_and_subscription codifies the
 * rows that went live through the admin on 2026-09-23. These are the lists it must
 * produce, and what the pages must show:
 *   /subscription, signed out AND as demo-vendor: 8 questions in this order (Andy's 5,
 *     then the 3 still-accurate seeded ones), the Phase 9 "Lowest billing plan?" answer,
 *     and "Contact us" as a mailto:hello@cosora.in link, not a question;
 *   /seller, signed out (Phase 9's placement for this surface): Andy's 10, in his order.
 * The pages must also match the table exactly (they read the CDN snapshot first).
 * Tracking RPCs are answered in the browser.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(REPO_ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const SHOTS = path.join(REPO_ROOT, "screenshots");
const VENDOR = "demo-vendor@cosora.dev";
const TRACKING = /\/rest\/v1\/rpc\/(log_engagement_event|ad_impression|ad_click|increment_product_view|increment_video_view|increment_product_enquiry)(\?|$)/;
const CONTACT = "mailto:hello@cosora.in?subject=Subscription%20question";

const SUBSCRIPTION = [
  "Can I upgrade or downgrade my plan anytime?",
  "Is there a refund policy?",
  "What happens when I reach my lead limit?",
  "Do you offer discounts for annual billing?",
  "Lowest billing plan?",
  "How does billing work — is there autopay?",
  "What payment methods do you accept?",
  "How is GST handled?",
];
const SELLER_REGISTRATION = [
  "What is Cosora?",
  "Who can register as a seller on Cosora?",
  "Is there any cost to register?",
  "What documents are required to register?",
  "I don't have a GST number. Can I still register?",
  "How do buyers contact me?",
  "How are leads managed on Cosora?",
  "How long does it take to get verified?",
  "Do I need to ship products through Cosora?",
  "Can I edit my listings after uploading?",
];

test.skip(!hasCredentials("DEMO_VENDOR_PASSWORD"), "set DEMO_VENDOR_PASSWORD in .env");

async function tableQuestions(surface: string): Promise<string[]> {
  const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.from("faqs").select("question")
    .eq("surface", surface).eq("active", true).order("position").order("created_at").order("id");
  if (error) throw new Error(error.message);
  return (data as { question: string }[]).map((r) => r.question);
}

async function open(browser: Browser, url: string, session?: Session) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (session) {
    await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  }
  await ctx.route(TRACKING, (r) => r.fulfill({ status: 204 }));
  const page = await ctx.newPage();
  // The FAQ checks wait for the list itself; /seller keeps media requests going, so
  // "networkidle" can take longer than the test.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

test("/subscription shows the 8 Subscription FAQs in order, and Contact us as a mailto link", async ({ browser }) => {
  expect(await tableQuestions("subscription"), "the table's active Subscription FAQs").toEqual(SUBSCRIPTION);

  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: VENDOR, password: demoPasswordFor(VENDOR) });
  if (error) throw new Error(error.message);

  for (const [who, session] of [["signed out", undefined], ["demo-vendor", data.session as Session]] as const) {
    const { ctx, page } = await open(browser, "/subscription", session);
    const card = page.locator('[data-faq-surface="subscription"]');
    await expect(card.locator("button[data-state]").first()).toBeAttached({ timeout: 15_000 });
    const questions = (await card.locator("button[data-state]").allInnerTexts()).map((q) => q.trim());
    expect(questions, `${who}: the 8 questions, in order`).toEqual(SUBSCRIPTION);
    expect(questions.some((q) => /contact us/i.test(q)), `${who}: "Contact us" is not a question`).toBe(false);

    const contact = card.getByRole("link", { name: /Contact us/ });
    await expect(contact, `${who}: one Contact us link`).toHaveCount(1);
    expect(await contact.getAttribute("href"), `${who}: it writes to hello@cosora.in`).toBe(CONTACT);

    await card.getByRole("button", { name: "Lowest billing plan?" }).click();
    await expect(card.getByText(/Plans start at just ₹699\/month \(or ₹6,990\/year\) with Basic/), `${who}: the Phase 9 answer`).toBeVisible();
    if (session) {
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: path.join(SHOTS, "p24-subscription-faq-vendor.png") });
    }
    console.log(`/subscription (${who}): ${questions.length} questions, Contact us → ${await contact.getAttribute("href")}`);
    await ctx.close();
  }
});

test("/seller shows the 10 Seller Registration FAQs in order", async ({ browser }) => {
  expect(await tableQuestions("seller_registration"), "the table's active Seller Registration FAQs").toEqual(SELLER_REGISTRATION);
  const { ctx, page } = await open(browser, "/seller");
  const block = page.locator('[data-faq-surface="seller_registration"]');
  await expect(block.locator("button[data-state]").first()).toBeAttached({ timeout: 15_000 });
  const questions = (await block.locator("button[data-state]").allInnerTexts()).map((q) => q.trim());
  expect(questions, "signed out: the 10 questions, in order").toEqual(SELLER_REGISTRATION);
  await block.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600); // whileInView fade-in
  await block.screenshot({ path: path.join(SHOTS, "p24-seller-faq.png") });
  console.log(`/seller (signed out): ${questions.length} questions`);
  await ctx.close();
});
