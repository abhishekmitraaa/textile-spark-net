import { test, expect, type Page, type Route } from "@playwright/test";
import { hasCredentials, demoAccount } from "../scripts/lib/test-credentials.mjs";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cosora-Admin renders a deleted account as deleted (MPF-5).
 *
 * Accounts, the Vendors list and the <AccountStatus> card used to test
 * `account_status === "suspended"` and call anything else active, so a deleted
 * account showed a green "active" and offered Suspend, which
 * set_account_status() refuses (42501).
 *
 * WHY THE STATUS IS REWRITTEN IN THE BROWSER. No account is deleted, and one
 * can't be made for a test: 'deleted' is terminal. Only anonymize_account()
 * sets it, set_account_status() refuses to change it, and guard_deleted_account()
 * refuses every signed-in write to the account. So this spec intercepts the
 * admin's own reads of `account_status` (admin_profile_search() and the
 * profiles selects) and rewrites them for two demo accounts, in the browser only:
 *   demo-buyer  -> 'deleted'    (it also has a vendor_profiles row, so it is on Vendors)
 *   demo-vendor -> 'suspended'
 *   demo-admin  -> left as it is ('active')
 * That exercises exactly the rendering the fix changed, and writes nothing.
 * Every set_account_status call is recorded, and the spec asserts there were none.
 *
 * Needs Cosora-Admin's dev server (ADMIN_APP_URL, default :5174). ACCOUNT:
 * demo-admin (super_admin, so it may write). Read-only.
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

const BUYER_ID = "11111111-1111-1111-1111-111111111111";
const VENDOR_ID = "22222222-2222-2222-2222-222222222222";
const FAKE: Record<string, string> = { [BUYER_ID]: "deleted", [VENDOR_ID]: "suspended" };

test.skip(!hasCredentials("DEMO_ADMIN_PASSWORD"), "set DEMO_ADMIN_PASSWORD in .env (see .env.example)");

// Rewrites account_status on the real response, for the FAKE ids only.
async function rewriteStatus(route: Route) {
  const res = await route.fetch();
  const body = await res.text();
  let json: unknown;
  try { json = JSON.parse(body); } catch { return route.fulfill({ response: res, body }); }
  const fix = (row: Record<string, unknown>) =>
    row && typeof row === "object" && typeof row.id === "string" && FAKE[row.id] && "account_status" in row
      ? { ...row, account_status: FAKE[row.id] } : row;
  const out = Array.isArray(json) ? json.map(fix) : fix(json as Record<string, unknown>);
  // The body is re-serialized, so the original encoding and length no longer apply.
  const headers = Object.fromEntries(
    Object.entries(res.headers()).filter(([k]) => !["content-encoding", "content-length"].includes(k.toLowerCase())),
  );
  return route.fulfill({ status: res.status(), headers, body: JSON.stringify(out) });
}

async function adminPage(browser: import("@playwright/test").Browser) {
  const { email, password } = demoAccount("admin");
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login failed: ${error.message}`);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(data.session)] as const);
  const page = await ctx.newPage();
  await page.route(/\/rest\/v1\/(profiles(\?|$)|rpc\/admin_profile_search)/, rewriteStatus);
  const statusWrites: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/rest/v1/rpc/set_account_status")) statusWrites.push(r.url()); });
  return { ctx, page, statusWrites };
}

// The Account status card: its heading sits in a header row, directly inside the card.
const card = (page: Page) => page.getByRole("heading", { name: "Account status" }).locator("xpath=../..");
const statusCell = (row: import("@playwright/test").Locator) => row.locator("td").nth(3);

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test("Accounts: a deleted row shows a neutral 'deleted' badge and offers no action; active and suspended rows are unchanged", async ({ browser }) => {
  const { ctx, page, statusWrites } = await adminPage(browser);
  try {
    await page.goto(`${ADMIN_URL}/accounts`, { waitUntil: "networkidle" });
    await page.getByLabel("Search by name or email").fill("demo-");
    const rowFor = (email: string) => page.getByRole("row").filter({ hasText: email });
    const deletedRow = rowFor("demo-buyer@cosora.dev");
    const suspendedRow = rowFor("demo-vendor@cosora.dev");
    const activeRow = rowFor("demo-admin@cosora.dev");
    await expect(deletedRow).toHaveCount(1);
    await expect(suspendedRow).toHaveCount(1);
    await expect(activeRow).toHaveCount(1);

    // Deleted: neutral badge, no active/suspended wording, and "View" rather than "Manage".
    await expect(statusCell(deletedRow), "deleted row's status").toHaveText("deleted");
    await expect(statusCell(deletedRow).locator("span").first(), "a neutral badge").toHaveClass(/bg-neutral-bg/);
    await expect(deletedRow.getByRole("button", { name: "Manage" })).toHaveCount(0);
    // Unchanged: suspended and active.
    await expect(statusCell(suspendedRow).locator("span").first(), "suspended badge").toHaveText("suspended");
    await expect(statusCell(suspendedRow).locator("span").first()).toHaveClass(/bg-critical-bg/);
    await expect(statusCell(activeRow), "active row's status").toHaveText("active");
    await expect(statusCell(activeRow).locator("span").first()).toHaveClass(/bg-positive-bg/);
    await page.getByRole("table").screenshot({ path: path.join(SHOTS, "mpf5-admin-accounts-deleted.png") });

    // The deleted account's card: badge, the explanation, and no status action.
    await deletedRow.getByRole("button", { name: "View" }).click();
    const c = card(page);
    await expect(c.getByText("deleted", { exact: true }), "card badge").toBeVisible();
    await expect(c.getByText("This account was deleted by its owner")).toBeVisible();
    await expect(c.getByRole("button", { name: /Suspend account|Reinstate account/ }), "no status action").toHaveCount(0);
    await expect(c.getByText("What suspending actually stops")).toHaveCount(0);
    await expect(c.getByText("Suspension ledger"), "the history is still readable").toBeVisible();
    await expect(c.getByText("Loading…"), "the ledger has loaded").toHaveCount(0);
    await c.screenshot({ path: path.join(SHOTS, "mpf5-admin-account-card-deleted.png") });

    // Unchanged: a suspended account's card offers Reinstate, an active one Suspend.
    await suspendedRow.getByRole("button", { name: "Manage" }).click();
    await expect(card(page).getByRole("button", { name: "Reinstate account" })).toBeVisible();
    await expect(card(page).getByText("What suspending actually stops")).toBeVisible();
    await activeRow.getByRole("button", { name: "Manage" }).click();
    await expect(card(page).getByRole("button", { name: "Suspend account" })).toBeVisible();

    expect(statusWrites, "nothing called set_account_status").toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("Vendors list and vendor page: the same three states", async ({ browser }) => {
  const { ctx, page, statusWrites } = await adminPage(browser);
  try {
    await page.goto(`${ADMIN_URL}/vendors`, { waitUntil: "networkidle" });
    // A vendor row links to /vendors/<id>; find the demo rows by that link.
    const rowById = (id: string) => page.getByRole("row").filter({ has: page.locator(`a[href="/vendors/${id}"]`) });
    await expect(rowById(BUYER_ID), "demo-buyer's vendor row").toHaveCount(1);
    await expect(rowById(BUYER_ID).getByText("deleted", { exact: true })).toBeVisible();
    await expect(rowById(BUYER_ID).getByText("active", { exact: true })).toHaveCount(0);
    await expect(rowById(VENDOR_ID).getByText("suspended", { exact: true })).toBeVisible();

    await page.goto(`${ADMIN_URL}/vendors/${BUYER_ID}`, { waitUntil: "networkidle" });
    const c = card(page);
    await expect(c.getByText("This account was deleted by its owner")).toBeVisible();
    await expect(c.getByRole("button", { name: /Suspend account|Reinstate account/ })).toHaveCount(0);

    await page.goto(`${ADMIN_URL}/vendors/${VENDOR_ID}`, { waitUntil: "networkidle" });
    await expect(card(page).getByRole("button", { name: "Reinstate account" })).toBeVisible();

    expect(statusWrites, "nothing called set_account_status").toEqual([]);
  } finally {
    await ctx.close();
  }
});
