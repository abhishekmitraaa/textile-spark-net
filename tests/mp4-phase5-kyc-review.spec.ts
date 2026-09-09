import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 4, Phase 5 — the vendor-facing half of the KYC review loop.
 *
 * The admin verdict itself is exercised against the real
 * set_vendor_document_verified() function (see the report). What can only be
 * checked in a browser is whether the rejected vendor actually SEES the reason
 * — a rejection the vendor cannot read is the same as no rejection at all.
 *
 *   npx playwright test tests/mp4-phase5-kyc-review.spec.ts
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
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const SHOTS = path.join(REPO_ROOT, "screenshots");

const EMAIL = "zz-mp4-vendor@cosora.in";
const PASSWORD = "CosoraQA!2026";
const VENDOR_ID = "9ddda61f-d778-41a5-b568-39fd9f3eb37a";
const REASON = "The PAN scan is cut off at the bottom edge — please re-upload the full card.";

test("MP4 P5 — a rejected vendor sees the reason, and the KYC document opens via a signed URL", async ({ browser }) => {
  mkdirSync(SHOTS, { recursive: true });
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`login failed: ${error.message}`);

  // Precondition, straight from the row the admin verdict wrote. This spec
  // reads a REVIEW STATE it cannot create for itself — only an admin session
  // can call set_vendor_document_verified(), and this one is a vendor. So it
  // skips rather than fails when the document is not currently rejected;
  // reject it as an admin first (see the Phase 5 report) and re-run.
  const { data: doc } = await db
    .from("vendor_documents")
    .select("verified, rejection_reason")
    .eq("vendor_id", VENDOR_ID)
    .eq("doc_type", "pan")
    .maybeSingle();
  test.skip(
    doc?.verified !== false || doc?.rejection_reason !== REASON,
    `PAN document is not in the rejected state under test (verified=${doc?.verified}) — reject it as an admin first`,
  );

  const ctx = await browser.newContext();
  await ctx.addInitScript(
    ([key, session]) => window.localStorage.setItem(key, session),
    [STORAGE_KEY, JSON.stringify(auth.session)] as [string, string],
  );
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/kyc");
  await expect(page.getByText("Rejected").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(REASON)).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "mp4-kyc-rejected.png"), fullPage: true });

  // The document opens through a signed URL minted on demand for THIS click —
  // a private bucket has no public URL, so this is the only read path there is,
  // and nothing is handed out for documents nobody opened.
  const viewer = page.getByRole("button", { name: "View", exact: true }).first();
  await expect(viewer).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent("popup"), viewer.click()]);
  const url = popup.url();
  expect(url, "a signed URL, not a bare public one").toContain("token=");
  expect(url).toContain("/object/sign/business-docs/");
  expect((await fetch(url)).ok, "the signed URL resolves").toBe(true);
  await popup.close();

  expect(errors, "no console errors on /kyc").toEqual([]);
  await ctx.close();
});
