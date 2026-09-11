import { test, expect, type Browser } from "@playwright/test";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 7 (buyer-trust thread), Phase 6 — the two Cosora-Admin panels
 * render against real rows, and the KYC verdict round-trips through real
 * buttons, BEFORE the panels are pushed.
 *
 * Until now VendorKycPanel's approve/reject had only been proved at the RPC
 * layer ("no admin credentials in this environment"), and VendorContractPanel
 * had never been rendered at all. Both were wrong reasons: a super_admin demo
 * credential has been in this repo since July (see securityflags.md). This spec
 * does NOT add another copy of it — credentials come from the environment:
 *
 *   DEMO_ADMIN_PASSWORD=... MP_VENDOR_PASSWORD=... \
 *     npx playwright test tests/mp7-admin-vendor-panels.spec.ts
 *
 * Needs both dev servers: the vendor app (playwright baseURL) and Cosora-Admin
 * on ADMIN_APP_URL (default :5174).
 *
 * MUTATES one row: vendor 9ddda61f…'s PAN document is rejected with a reason,
 * checked on the vendor's own /kyc, then approved. It ENDS VERIFIED whatever it
 * started as — set_vendor_document_verified() has no "un-review". It is the
 * throwaway vendor from Master Prompt 4, kept as evidence, not a real business.
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
const ADMIN_URL = process.env.ADMIN_APP_URL ?? "http://localhost:5174";
const SHOTS = path.join(REPO_ROOT, "screenshots");

const ADMIN = { email: "demo-admin@cosora.dev", password: optionalCredential("DEMO_ADMIN_PASSWORD") };
const VENDOR = { email: "zz-mp4-vendor@cosora.in", password: optionalCredential("MP_VENDOR_PASSWORD") };

/** Throwaway vendor: two DRAWN-signature contracts at the same version, one PAN. */
const DRAWN = "9ddda61f-d778-41a5-b568-39fd9f3eb37a";
/** demo-buyer fixture: one TYPED contract (signature_url is null). */
const TYPED = "11111111-1111-1111-1111-111111111111";
const REASON = "The PAN scan is cut off at the bottom edge — please re-upload the full card.";

test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.password || !VENDOR.password, "set DEMO_ADMIN_PASSWORD and MP_VENDOR_PASSWORD");

async function session(who: { email: string; password?: string }) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email: who.email, password: who.password! });
  if (error) throw new Error(`login failed for ${who.email}: ${error.message}`);
  return { db, session: data.session, id: data.user!.id };
}

async function contextFor(browser: Browser, who: { email: string; password?: string }) {
  const { session: s } = await session(who);
  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, value]: [string, string]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(s)] as [string, string],
  );
  return ctx;
}

async function panDoc() {
  const { db } = await session(ADMIN);
  const { data } = await db.from("vendor_documents")
    .select("verified, rejection_reason, reviewed_by").eq("vendor_id", DRAWN).eq("doc_type", "pan").single();
  return data!;
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("P6.a Supplier agreement panel: drawn signatures open via signed URL; duplicates are flagged", async ({ browser }) => {
  const ctx = await contextFor(browser, ADMIN);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${ADMIN_URL}/vendors/${DRAWN}`);
  await expect(page.getByText("Supplier agreement", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("2026-09-v1")).toHaveCount(2);
  const view = page.getByRole("button", { name: "View signature" });
  await expect(view).toHaveCount(2);
  await expect(page.getByText(/More than one agreement on file/)).toBeVisible();
  // Read-only by design: the table has no update/delete policy for anyone.
  await expect(page.getByRole("button", { name: /delete|edit|revoke contract/i })).toHaveCount(0);

  const [popup] = await Promise.all([page.waitForEvent("popup"), view.first().click()]);
  const url = popup.url();
  expect(url).toContain("/object/sign/business-docs/");
  expect(url).toContain("token=");
  expect((await fetch(url)).ok, "signature resolves through the signed URL").toBe(true);
  await popup.close();

  await page.screenshot({ path: path.join(SHOTS, "mp7-admin-contract-drawn.png"), fullPage: true });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("P6.b a TYPED signature says so — no broken image, no blank", async ({ browser }) => {
  const ctx = await contextFor(browser, ADMIN);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/vendors/${TYPED}`);
  await expect(page.getByText("Supplier agreement", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("typed — no image on file")).toBeVisible();
  await expect(page.getByRole("button", { name: "View signature" })).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "mp7-admin-contract-typed.png"), fullPage: true });
  await ctx.close();
});

test("P6.c KYC verdict round-trips through the real buttons, and the vendor sees the reason", async ({ browser }) => {
  const admin = await session(ADMIN);
  const before = await panDoc();

  const ctx = await contextFor(browser, ADMIN);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/vendors/${DRAWN}`);
  // A heading, not text: the Manual-verification card also labels a row "KYC documents".
  await expect(page.getByRole("heading", { name: "KYC documents" })).toBeVisible({ timeout: 30_000 });

  // Scope to the PAN row: GST sits in the same panel with its own buttons.
  const panRow = page.locator("div.px-3.py-3").filter({ has: page.locator("p", { hasText: /^PAN$/ }) });
  await expect(panRow).toHaveCount(1);
  // A verified document offers "Revoke and reject"; an unreviewed one, "Reject".
  await panRow.getByRole("button", { name: before.verified ? "Revoke and reject" : "Reject", exact: true }).click();
  await page.getByPlaceholder(/The scan is cut off at the bottom/).fill(REASON);
  await page.getByRole("button", { name: "Reject document" }).click();
  await expect(page.getByText(REASON)).toBeVisible({ timeout: 20_000 });

  const rejected = await panDoc();
  expect(rejected.verified).toBe(false);
  expect(rejected.rejection_reason).toBe(REASON);
  expect(rejected.reviewed_by, "stamped with the clicking admin").toBe(admin.id);
  await page.screenshot({ path: path.join(SHOTS, "mp7-admin-kyc-rejected.png"), fullPage: true });

  // The vendor, on their own /kyc in the vendor app, sees the reason.
  const vctx = await contextFor(browser, VENDOR);
  const vpage = await vctx.newPage();
  await vpage.goto("/kyc");
  await expect(vpage.getByText(REASON)).toBeVisible({ timeout: 25_000 });
  await vctx.close();

  // Approve. The document ends verified — the review RPC has no "un-review".
  await panRow.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(REASON)).toHaveCount(0, { timeout: 20_000 });
  const approved = await panDoc();
  expect(approved.verified).toBe(true);
  expect(approved.rejection_reason, "approving clears the note").toBeNull();
  await ctx.close();
});
