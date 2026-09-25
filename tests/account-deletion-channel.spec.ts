import { test, expect, type Browser, type Page, type Route } from "@playwright/test";
import { hasCredentials, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MPF-6 (Phase 18): "Delete my account" words each step for the channel the code
 * goes to: email, or WhatsApp for an account with no email.
 *
 * The server side (routing, not_configured, the Meta call) is covered by the
 * rolled-back database tests and the edge-function harness in test.md; this spec
 * covers the app's wording. The `account-deletion` function and the open-request
 * read are answered in the browser, so every server answer can be shown without a
 * WhatsApp sender, and nothing is written. demo-buyer has a vendor_profiles row, so
 * the real server would answer `vendor` for it; that is why its answers are mocked.
 *
 *   1. Email account: the wording is unchanged ("Email me a code", "We sent a code
 *      to d****@…").
 *   2. Phone-only account (the session's user carries a confirmed phone and no
 *      email, as a mobile sign-up's does): "Send code on WhatsApp", then "We've
 *      sent a code to your WhatsApp number +91 …".
 *   3. Every non-success answer, per channel.
 *   4. A code already sent: the dialog opens on the code step, worded from the
 *      open request's channel.
 *
 * ACCOUNT: demo-buyer. Read-only. Requires `npm run dev` on :8080.
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
const FUNCTION = /\/functions\/v1\/account-deletion$/;
const OPEN_REQUEST = /\/rest\/v1\/account_deletion_requests\?select=/;
const EXPIRES = new Date(Date.now() + 10 * 60_000).toISOString();

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env");

async function pageAs(browser: Browser, shape: "email" | "phone-only") {
  const { email, password } = demoAccount("buyer");
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed: ${error.message}`);
  const session = data.session;
  if (shape === "phone-only") {
    // What a mobile sign-up's session user looks like. Only the wording reads it;
    // the server's answers below are mocked either way.
    session.user = { ...session.user, email: "", email_confirmed_at: undefined, phone: "910000018099", phone_confirmed_at: new Date().toISOString() };
  }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  return { ctx, page: await ctx.newPage() };
}

async function answerFunction(page: Page, answer: Record<string, unknown>) {
  await page.unroute(FUNCTION);
  await page.route(FUNCTION, (route: Route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } })
      : route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(answer) }));
}

async function answerOpenRequest(page: Page, rows: unknown[]) {
  await page.route(OPEN_REQUEST, (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) }));
}

async function openDelete(page: Page) {
  await page.goto("/profile/settings", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Delete my account" }).click();
  return page.getByRole("dialog");
}

test("an email account's wording is unchanged", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "email");
  try {
    await answerOpenRequest(page, []);
    await answerFunction(page, { status: "sent", channel: "email", to: "d**********@cosora.dev", expires_at: EXPIRES });
    const dialog = await openDelete(page);
    await expect(dialog.getByText("We'll email a 6-digit code to the email address on your account. Enter it to confirm.")).toBeVisible();
    await dialog.getByRole("button", { name: "Email me a code" }).click();
    await expect(dialog.getByText("We sent a code to d**********@cosora.dev. It expires in 10 minutes.")).toBeVisible();
    await expect(dialog.getByText(/WhatsApp/)).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("a phone-only account is told the code goes to WhatsApp", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "phone-only");
  try {
    await answerOpenRequest(page, []);
    await answerFunction(page, { status: "sent", channel: "whatsapp", to: "+91 *******099", expires_at: EXPIRES });
    const dialog = await openDelete(page);
    await expect(dialog.getByText("We'll send a 6-digit code to your phone number on WhatsApp. Enter it to confirm.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Email me a code" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Send code on WhatsApp" }).click();
    await expect(dialog.getByText("We've sent a code to your WhatsApp number +91 *******099. It expires in 10 minutes.")).toBeVisible();
    await expect(dialog.getByLabel("Deletion code")).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, "mpf6-whatsapp-code-sent.png") });
  } finally {
    await ctx.close();
  }
});

test("each non-success answer is worded for its channel", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "phone-only");
  try {
    await answerOpenRequest(page, []);
    const cases: [Record<string, unknown>, string, string][] = [
      [{ status: "not_configured", channel: "whatsapp" }, "Account deletion isn't available online yet",
        "Your account has no email, so we confirm over WhatsApp, and that isn't set up yet. Write to hello@cosora.in and we'll delete it for you."],
      [{ status: "not_configured", channel: "email" }, "Account deletion isn't available online yet",
        "Email confirmation isn't set up. Write to hello@cosora.in and we'll delete it for you."],
      [{ status: "no_contact" }, "We can't send you a code",
        "Your account has no confirmed email address or phone number. Write to hello@cosora.in."],
      [{ status: "no_email" }, "We can't send you a code",
        "Your account has no confirmed email address or phone number. Write to hello@cosora.in."],
      [{ status: "send_failed", channel: "whatsapp", message: "template name (account_deletion_code) does not exist in en" },
        "We couldn't send the WhatsApp message", "template name (account_deletion_code) does not exist in en"],
      [{ status: "send_failed", channel: "email", message: "The from address is not verified." },
        "We couldn't send the email", "The from address is not verified."],
    ];
    for (const [answer, title, description] of cases) {
      await answerFunction(page, answer);
      const dialog = await openDelete(page);
      await dialog.getByRole("button", { name: "Send code on WhatsApp" }).click();
      const alert = dialog.getByRole("alert");
      await expect(alert.getByText(title, { exact: true }), JSON.stringify(answer)).toBeVisible();
      await expect(alert.getByText(description, { exact: true }), JSON.stringify(answer)).toBeVisible();
    }
  } finally {
    await ctx.close();
  }
});

test("a code already sent opens on the code step, worded from the request's channel", async ({ browser }) => {
  const { ctx, page } = await pageAs(browser, "email");
  try {
    const row = { id: "00000000-0000-4000-8000-000000000018", status: "pending_confirmation", requested_at: new Date().toISOString(), scheduled_for: null, code_expires_at: EXPIRES };
    await answerOpenRequest(page, [{ ...row, channel: "whatsapp" }]);
    let dialog = await openDelete(page);
    await expect(dialog.getByText("We've sent a code to your WhatsApp number. It expires in 10 minutes.")).toBeVisible();

    await page.unroute(OPEN_REQUEST);
    await answerOpenRequest(page, [{ ...row, channel: "email" }]);
    dialog = await openDelete(page);
    await expect(dialog.getByText("We sent a code to your email. It expires in 10 minutes.")).toBeVisible();
  } finally {
    await ctx.close();
  }
});
