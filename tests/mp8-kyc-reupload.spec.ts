import { test, expect } from "@playwright/test";
import { optionalCredential } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Master Prompt 8, Phase 3 — a rejected vendor can get back in.
 *
 * An admin rejects the throwaway vendor's PAN; the vendor replaces it on /kyc
 * through the new control; then, checked in the DATABASE, in STORAGE and in the
 * ADMIN PANEL:
 *   - exactly one PAN row, a new one, unreviewed (verified false, no reason,
 *     no reviewed_at) with a new file path;
 *   - the rejected row and its object are gone (one active document per type,
 *     no stranded identity scan);
 *   - Cosora-Admin shows the PAN as "awaiting review", not "rejected".
 * Finally the admin approves it through the panel's real button.
 *
 * Needs both dev servers: the vendor app (baseURL) and Cosora-Admin on
 * ADMIN_APP_URL (default :5174). Credentials from .env / the environment.
 *
 * MUTATES the throwaway vendor 9ddda61f… (Master Prompt 4's evidence account,
 * not a real business): its PAN file is replaced by a 1×1 PNG and the row ends
 * VERIFIED, as Master Prompt 7's spec also leaves it.
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
const VENDOR_ID = "9ddda61f-d778-41a5-b568-39fd9f3eb37a";
const REASON = "MP8 re-upload test: the PAN scan is unreadable, please upload a sharper copy.";

/** A 1×1 PNG — a real image, so the upload exercises storage with a valid file. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe.configure({ mode: "serial" });
test.skip(!ADMIN.password || !VENDOR.password, "set DEMO_ADMIN_PASSWORD and MP_VENDOR_PASSWORD in .env");

async function session(who: { email: string; password: string }) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword(who);
  if (error) throw new Error(`login failed for ${who.email}: ${error.message}`);
  return { db, session: data.session, id: data.user!.id };
}

async function panRows(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.from("vendor_documents")
    .select("id, file_url, verified, rejection_reason, reviewed_at")
    .eq("vendor_id", VENDOR_ID).eq("doc_type", "pan");
  if (error) throw error;
  return data as { id: string; file_url: string | null; verified: boolean; rejection_reason: string | null; reviewed_at: string | null }[];
}

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("P3 a rejected PAN is replaced on /kyc and goes back to 'awaiting review'", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await session(ADMIN);

  // Arrange: reject the current PAN. The admin UI's reject button was proved in
  // Master Prompt 7 (P6.c); here it is the RPC it calls.
  const [before] = await panRows(admin.db);
  expect(before, "the throwaway vendor has a PAN row to reject").toBeTruthy();
  const { error: rej } = await admin.db.rpc("set_vendor_document_verified", {
    p_doc_id: before.id, p_verified: false, p_reason: REASON,
  });
  expect(rej).toBeNull();

  // Act: the vendor replaces it through the new control.
  const vendor = await session(VENDOR);
  const vctx = await browser.newContext();
  await vctx.addInitScript(([k, v]: [string, string]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, JSON.stringify(vendor.session)] as [string, string]);
  const vpage = await vctx.newPage();
  const errors: string[] = [];
  vpage.on("pageerror", (e) => errors.push(String(e)));
  await vpage.goto("/kyc");
  await expect(vpage.getByText(REASON)).toBeVisible({ timeout: 25_000 });
  await expect(vpage.getByText(/contact support from/)).toBeVisible();
  await vpage.screenshot({ path: path.join(SHOTS, "mp8-p3-kyc-rejected.png"), fullPage: true });

  await vpage.getByLabel("Replacement PAN file").setInputFiles({ name: "pan-replacement.png", mimeType: "image/png", buffer: PNG });
  await expect(vpage.getByText("PAN sent for review")).toBeVisible({ timeout: 30_000 });
  await expect(vpage.getByText(REASON)).toHaveCount(0, { timeout: 15_000 });
  await expect(vpage.getByText("In review").first()).toBeVisible();
  await vpage.screenshot({ path: path.join(SHOTS, "mp8-p3-kyc-resubmitted.png"), fullPage: true });
  expect(errors, "no page errors on /kyc").toEqual([]);
  await vctx.close();

  // Assert — database: exactly one PAN row, a NEW one, unreviewed.
  const after = await panRows(admin.db);
  expect(after, "one active PAN row, not a pile of attempts").toHaveLength(1);
  const now = after[0];
  expect(now.id, "a new row, not an edit of the rejected one").not.toBe(before.id);
  expect(now.verified).toBe(false);
  expect(now.rejection_reason).toBeNull();
  expect(now.reviewed_at, "unreviewed: the guard forces a fresh INSERT to pending").toBeNull();
  expect(now.file_url).toMatch(new RegExp(`^${VENDOR_ID}/kyc/`));
  expect(now.file_url).not.toBe(before.file_url);

  // Assert — storage: the new object resolves, the superseded one is gone.
  const { error: newErr } = await admin.db.storage.from("business-docs").createSignedUrl(now.file_url!, 60);
  expect(newErr, "the replacement is really in business-docs").toBeNull();
  const { data: oldList } = await admin.db.storage.from("business-docs")
    .list(`${VENDOR_ID}/kyc`, { search: path.basename(before.file_url!) });
  expect(oldList ?? [], "the rejected scan was removed, not stranded").toHaveLength(0);

  // Assert — the admin panel shows it pending, then the real Approve button works.
  const actx = await browser.newContext();
  await actx.addInitScript(([k, v]: [string, string]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, JSON.stringify(admin.session)] as [string, string]);
  const apage = await actx.newPage();
  await apage.goto(`${ADMIN_URL}/vendors/${VENDOR_ID}`);
  await expect(apage.getByRole("heading", { name: "KYC documents" })).toBeVisible({ timeout: 30_000 });
  const panRow = apage.locator("div.px-3.py-3").filter({ has: apage.locator("p", { hasText: /^PAN$/ }) });
  await expect(panRow).toHaveCount(1);
  await expect(panRow.getByText("awaiting review")).toBeVisible();
  await expect(panRow.getByText("rejected")).toHaveCount(0);
  await apage.screenshot({ path: path.join(SHOTS, "mp8-p3-admin-awaiting-review.png"), fullPage: true });

  await panRow.getByRole("button", { name: "Approve" }).click();
  await expect(panRow.getByText("verified")).toBeVisible({ timeout: 20_000 });
  const [approved] = await panRows(admin.db);
  expect(approved.verified).toBe(true);
  await actx.close();
});
