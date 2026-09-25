import { test, expect, type Browser, type Page, type Request } from "@playwright/test";
import { hasCredentials, demoPasswordFor } from "../scripts/lib/test-credentials.mjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A profile save writes only what changed (MPF-9).
 *
 * saveProfileFull() used to write every field on every save, so a job-title
 * save turned demo-buyer's NULL country into "India". Now the edit pages diff
 * the form against what loaded and send only the fields that differ.
 *
 *   1. /profile/edit, job title only: the one write request carries `id` and
 *      `job_title` and nothing else; every other column of both rows is
 *      unchanged, and a NULL country stays NULL.
 *   2. /profile/business-details, State cleared: saved as NULL (a cleared field
 *      is a change, not skipped by the diff). Country shows "India" only as a
 *      placeholder.
 *   3. Saving an untouched form sends no write and says "No changes to save".
 *
 * And the sign-in step, applyPendingSignupProfile(), applies a signup name once
 * (MPF-9, MPF-20). It used to save a whole blank buyer profile on every sign-in,
 * and to write a vendor's signup brand back over a renamed one.
 *   4. Buyer: with a company saved, nothing is written and the pending
 *      `brand_name` is cleared from the metadata. With none saved, only
 *      `company` is written, then the metadata is cleared. If that write fails,
 *      the metadata is kept for the next sign-in. After that, a company the
 *      buyer clears stays cleared.
 *   5. Vendor: the same, with `vendor_profiles.brand_name`.
 * The metadata writes are real. Clearing uses `brand_name: null`, which Supabase
 * Auth treats as "remove the key", so each run ends with the metadata exactly as
 * it began.
 *
 * Contact details and metadata are compared, never printed. ACCOUNTS:
 * demo-buyer@cosora.dev, and demo-vendor@cosora.dev for test 5. MUTATING,
 * self-restoring: rows are put back in full, and a pending `brand_name` is
 * removed. Set KEEP_DIFF_MARKERS=1 to leave test 1's markers for a SQL check,
 * then restore by hand. Tests 4 and 5 import a module from the dev server, so
 * they need `npm run dev` on :8080, not a production build.
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
const BUYER = "demo-buyer@cosora.dev";
const VENDOR = "demo-vendor@cosora.dev";
// The non-contact columns clients may select on profiles (MPF-3).
const PROFILE_COLS = "id, full_name, avatar_url, active_role, onboarded, account_status, created_at";

test.skip(!hasCredentials("DEMO_BUYER_PASSWORD"), "set DEMO_BUYER_PASSWORD in .env (see .env.example)");
test.describe.configure({ mode: "serial" });

type Row = Record<string, unknown>;
interface Snapshot { buyer: Row; profile: Row; contact: string }

async function signIn(email = BUYER) {
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password: demoPasswordFor(email) });
  if (error) throw new Error(`login failed: ${error.message}`);
  return { db, session: data.session, uid: data.user.id };
}

// Both rows in full. email and phone come through my_contact_info(), kept as
// one opaque string so an assertion never prints them.
async function snapshot(db: SupabaseClient, uid: string): Promise<Snapshot> {
  const [b, p, c] = await Promise.all([
    db.from("buyer_profiles").select("*").eq("id", uid).single(),
    db.from("profiles").select(PROFILE_COLS).eq("id", uid).single(),
    db.rpc("my_contact_info").maybeSingle(),
  ]);
  for (const r of [b, p, c]) if (r.error) throw r.error;
  return { buyer: b.data as Row, profile: p.data as Row, contact: JSON.stringify(c.data) };
}

// Puts both rows back as snapshotted, every column, so a run against broken code
// (the old save blanked name, email and phone) still leaves the account intact.
async function restore(db: SupabaseClient, uid: string, s: Snapshot) {
  const { id: _id, ...buyer } = s.buyer;
  const contact = JSON.parse(s.contact) as { email: string | null; phone: string | null } | null;
  const [b, p] = await Promise.all([
    db.from("buyer_profiles").update(buyer).eq("id", uid),
    db.from("profiles").update({
      full_name: s.profile.full_name as string | null,
      avatar_url: s.profile.avatar_url as string | null,
      ...(contact ? { email: contact.email, phone: contact.phone } : {}),
    }).eq("id", uid),
  ]);
  if (b.error) throw b.error;
  if (p.error) throw p.error;
}

function expectUnchangedExcept(after: Snapshot, before: Snapshot, changed: Row, what: string) {
  expect(after.buyer, `${what}: every other buyer_profiles column unchanged`).toEqual({ ...before.buyer, ...changed });
  expect(after.profile, `${what}: profiles unchanged`).toEqual(before.profile);
  expect(after.contact === before.contact, `${what}: email and phone unchanged (compared, not printed)`).toBe(true);
}

// Every write the page sends to a profile table, or to the user's auth metadata
// (PUT /auth/v1/user, recorded as "auth user").
function recordWrites(page: Page) {
  const writes: { method: string; table: string; body: Row }[] = [];
  page.on("request", (r: Request) => {
    const url = new URL(r.url());
    const table = url.pathname === "/auth/v1/user" ? "auth user" : url.pathname.replace("/rest/v1/", "");
    if (!["profiles", "buyer_profiles", "vendor_profiles", "auth user"].includes(table)) return;
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) return;
    writes.push({ method: r.method(), table, body: (r.postDataJSON() ?? {}) as Row });
  });
  return writes;
}

const summary = (writes: { method: string; table: string }[]) => writes.map((w) => `${w.method} ${w.table}`);

// The signed-in user's metadata as the server holds it, as one opaque string.
async function metadata(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  return JSON.stringify(data.user.user_metadata ?? {});
}
const pendingBrand = (meta: string) => (JSON.parse(meta) as { brand_name?: unknown }).brand_name;

// The real applyPendingSignupProfile(), imported from the dev server into a
// signed-in page, given the fields it reads: the id, and brand_name as the
// server holds it now (none once cleared). A string, so the spec's transpiler
// can't rewrite the browser-side import().
async function applyPending(page: Page, db: SupabaseClient, uid: string, role: "buyer" | "seller") {
  const brand = pendingBrand(await metadata(db));
  const user = { id: uid, user_metadata: { ...(brand === undefined ? {} : { brand_name: brand }), active_role: role } };
  await page.evaluate(`(async () => {
    const m = await import("/src/lib/queries/signupProfile.ts");
    await m.applyPendingSignupProfile(${JSON.stringify(user)});
  })()`);
}

async function pageAs(browser: Browser, session: unknown) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(([k, v]) => window.localStorage.setItem(k as string, v as string), [STORAGE_KEY, JSON.stringify(session)] as const);
  return { ctx, page: await ctx.newPage() };
}

test("a save writes only the changed field; a cleared field saves as NULL; an untouched form writes nothing", async ({ browser }) => {
  const { db, session, uid } = await signIn();
  const original = await snapshot(db, uid);
  // The check needs a NULL country (the value the old save turned into "India")
  // and a State to clear. Set them if a previous run left something else.
  const setup: Row = {};
  if (original.buyer.country !== null) setup.country = null;
  if (!original.buyer.state) setup.state = "[P14TEST] state";
  if (Object.keys(setup).length) {
    const { error } = await db.from("buyer_profiles").update(setup).eq("id", uid);
    if (error) throw error;
  }

  const { ctx, page } = await pageAs(browser, session);
  const writes = recordWrites(page);
  const jobMarker = `[P14TEST] job ${Date.now()}`;

  try {
    // ── 1. One field changed ──
    const before = await snapshot(db, uid);
    expect(before.buyer.country, "precondition: country is NULL").toBeNull();
    await page.goto("/profile/edit", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Edit profile" })).toBeVisible();
    writes.length = 0;
    await page.getByLabel("Job Title").fill(jobMarker);
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL("**/profile");
    await expect(page.getByText("Profile updated")).toBeVisible();

    expect(writes.map((w) => `${w.method} ${w.table}`), "exactly one write, to buyer_profiles").toEqual(["POST buyer_profiles"]);
    expect(Object.keys(writes[0].body).sort(), "it carries only id and job_title").toEqual(["id", "job_title"]);
    const afterJob = await snapshot(db, uid);
    expectUnchangedExcept(afterJob, before, { job_title: jobMarker }, "job title save");
    expect(afterJob.buyer.country, "a NULL country stays NULL").toBeNull();

    // ── 2. A field cleared on purpose ──
    await page.goto("/profile/business-details", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Business details" })).toBeVisible();
    const country = page.getByLabel("Country");
    await expect(country, "Country is empty").toHaveValue("");
    await expect(country, "India is only a placeholder").toHaveAttribute("placeholder", "India");
    await page.getByText("Business Address").locator("..").screenshot({ path: path.join(SHOTS, "profile-save-diff-country.png") });
    writes.length = 0;
    await page.getByLabel("State/Province").fill("");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL("**/profile");
    await expect(page.getByText("Business details updated")).toBeVisible();

    expect(writes.map((w) => `${w.method} ${w.table}`), "exactly one write, to buyer_profiles").toEqual(["POST buyer_profiles"]);
    expect(writes[0].body, "it carries only id and a NULL state").toEqual({ id: uid, state: null });
    const afterClear = await snapshot(db, uid);
    expectUnchangedExcept(afterClear, afterJob, { state: null }, "state clear");

    // ── 3. Nothing changed ──
    await page.goto("/profile/edit", { waitUntil: "networkidle" });
    await expect(page.getByLabel("Job Title")).toHaveValue(jobMarker);
    writes.length = 0;
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForURL("**/profile");
    await expect(page.getByText("No changes to save")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(writes, "an untouched form sends no write").toEqual([]);
    expectUnchangedExcept(await snapshot(db, uid), afterClear, {}, "no-change save");
  } finally {
    if (!process.env.KEEP_DIFF_MARKERS) {
      await restore(db, uid, original);
      expectUnchangedExcept(await snapshot(db, uid), original, {}, "restore");
    }
    await ctx.close();
  }
});

test("the sign-in step applies a buyer's signup company once, and only while none is saved", async ({ browser }) => {
  const { db, session, uid } = await signIn();
  const original = await snapshot(db, uid);
  const metaBefore = await metadata(db);
  expect(pendingBrand(metaBefore), "precondition: no pending brand_name").toBeUndefined();
  expect(original.buyer.company, "precondition: demo-buyer has a company").toBeTruthy();

  const { ctx, page } = await pageAs(browser, session);
  const writes = recordWrites(page);
  const brand = `[P14TEST] company ${Date.now()}`;
  const setPending = async () => {
    const { error } = await db.auth.updateUser({ data: { brand_name: brand } });
    if (error) throw error;
  };
  const setCompany = async (company: string | null) => {
    const { error } = await db.from("buyer_profiles").update({ company }).eq("id", uid);
    if (error) throw error;
  };

  try {
    await page.goto("/profile", { waitUntil: "networkidle" });

    // 1. A company is saved: nothing written, and the pending name cleared.
    await setPending();
    writes.length = 0;
    await applyPending(page, db, uid, "buyer");
    expect(summary(writes), "no profile write, only the metadata").toEqual(["PUT auth user"]);
    // `data` is ours; supabase-js adds its own top-level fields to the request.
    expect(writes[0].body.data, "it clears brand_name and nothing else").toEqual({ brand_name: null });
    expect((await metadata(db)) === metaBefore, "the metadata is exactly as before (compared, not printed)").toBe(true);
    expectUnchangedExcept(await snapshot(db, uid), original, {}, "company saved");

    // 2. No company, and the write fails: the name stays pending for the next sign-in.
    await setCompany(null);
    await setPending();
    await page.route("**/rest/v1/buyer_profiles*", (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" }) : route.continue());
    writes.length = 0;
    await applyPending(page, db, uid, "buyer");
    await page.unroute("**/rest/v1/buyer_profiles*");
    expect(summary(writes), "the write was tried, and the metadata left alone").toEqual(["POST buyer_profiles"]);
    expect(pendingBrand(await metadata(db)), "still pending").toBe(brand);

    // 3. No company: only the company written, then the name cleared.
    const before = await snapshot(db, uid);
    writes.length = 0;
    await applyPending(page, db, uid, "buyer");
    expect(summary(writes), "the company, then the metadata").toEqual(["POST buyer_profiles", "PUT auth user"]);
    expect(writes[0].body, "it carries only id and company").toEqual({ id: uid, company: brand });
    expectUnchangedExcept(await snapshot(db, uid), before, { company: brand }, "no company");
    expect((await metadata(db)) === metaBefore, "the metadata is exactly as before").toBe(true);

    // 4. The buyer clears the company, then signs in again: it doesn't come back (MPF-20).
    await setCompany(null);
    writes.length = 0;
    await applyPending(page, db, uid, "buyer");
    expect(writes, "nothing pending, nothing written").toEqual([]);
    expect((await snapshot(db, uid)).buyer.company, "a cleared company stays cleared").toBeNull();
  } finally {
    await restore(db, uid, original);
    if (pendingBrand(await metadata(db)) !== undefined) await db.auth.updateUser({ data: { brand_name: null } });
    expectUnchangedExcept(await snapshot(db, uid), original, {}, "restore");
    expect((await metadata(db)) === metaBefore, "metadata restored").toBe(true);
    await ctx.close();
  }
});

test("the sign-in step applies a vendor's signup brand once, and only while none is saved", async ({ browser }) => {
  test.skip(!hasCredentials("DEMO_VENDOR_PASSWORD"), "set DEMO_VENDOR_PASSWORD in .env (see .env.example)");
  const { db, session, uid } = await signIn(VENDOR);
  const vendorRow = async () => {
    const { data, error } = await db.from("vendor_profiles").select("*").eq("id", uid).single();
    if (error) throw error;
    return data as Row;
  };
  const original = await vendorRow();
  const metaBefore = await metadata(db);
  expect(pendingBrand(metaBefore), "precondition: no pending brand_name").toBeUndefined();
  expect(original.brand_name, "precondition: demo-vendor has a brand").toBeTruthy();

  const { ctx, page } = await pageAs(browser, session);
  const writes = recordWrites(page);
  const brand = `[P14TEST] brand ${Date.now()}`;
  const setPending = async () => {
    const { error } = await db.auth.updateUser({ data: { brand_name: brand } });
    if (error) throw error;
  };

  try {
    await page.goto("/seller-home", { waitUntil: "networkidle" });

    // 1. A brand is saved (a renamed one, say): it isn't written back.
    await setPending();
    writes.length = 0;
    await applyPending(page, db, uid, "seller");
    expect(summary(writes), "no vendor write, only the metadata").toEqual(["PUT auth user"]);
    expect(await vendorRow(), "the saved brand and the rest of the row unchanged").toEqual(original);
    expect((await metadata(db)) === metaBefore, "the metadata is exactly as before").toBe(true);

    // 2. No brand saved: only the brand written, then the name cleared.
    const { error } = await db.from("vendor_profiles").update({ brand_name: null }).eq("id", uid);
    if (error) throw error;
    await setPending();
    writes.length = 0;
    await applyPending(page, db, uid, "seller");
    expect(summary(writes), "the brand, then the metadata").toEqual(["POST vendor_profiles", "PUT auth user"]);
    expect(writes[0].body, "it carries only id and brand_name").toEqual({ id: uid, brand_name: brand });
    expect(await vendorRow(), "only brand_name changed").toEqual({ ...original, brand_name: brand });

    // 3. The next sign-in: nothing pending, nothing written.
    writes.length = 0;
    await applyPending(page, db, uid, "seller");
    expect(writes, "nothing pending, nothing written").toEqual([]);
  } finally {
    await db.from("vendor_profiles").update({ brand_name: original.brand_name as string }).eq("id", uid);
    if (pendingBrand(await metadata(db)) !== undefined) await db.auth.updateUser({ data: { brand_name: null } });
    expect(await vendorRow(), "vendor row restored").toEqual(original);
    expect((await metadata(db)) === metaBefore, "metadata restored").toBe(true);
    await ctx.close();
  }
});
