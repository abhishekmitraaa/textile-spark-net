/**
 * The 2026-10-20 admin audit's medium list (migration 20261020130000, Cosora-Admin fix/medium-2026-10-20).
 * Local stack only. Needs both apps, and for the function checks the two Cosora-Admin edge functions from
 * that branch served at LOCAL_REFUND_FN_URL / LOCAL_STAFF_FN_URL, with admin-refund-payment's
 * RAZORPAY_API_URL on a mock Razorpay (session scratchpad mock-razorpay.cjs) at LOCAL_MOCK_RAZORPAY_URL.
 *
 *   #9  staff temporary passwords: the database refuses an account still on one; a breached choice is
 *       refused; an expired one is refused; a manager can't reset a deactivated super admin.
 *   #11 the hourly token refresh no longer replaces the page (unsaved input survives).
 *   #12 approving from a stale queue doesn't publish a listing that changed.
 *   #13 refunds: a failed refund can be retried; legacy rupee amounts go out as whole paise; a refund
 *       Razorpay took but the invoice didn't record says so; a pending one isn't sent twice.
 *   #14 Ads: a scheduled campaign has a tab, and the pause wording is right.
 */
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_URL, freshAccount, sessionFor, signedInContext, sql, stack } from "./stack";

const REFUND_FN = process.env.LOCAL_REFUND_FN_URL;
const STAFF_FN = process.env.LOCAL_STAFF_FN_URL;
const MOCK_RZP = process.env.LOCAL_MOCK_RAZORPAY_URL ?? "http://localhost:8089";
const tag = Date.now().toString(36);
const staff: string[] = [];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
/** The first id in psql's output, which also carries command tags ("SET", "INSERT 0 1"). */
function idFrom(out: string): string {
  const m = out.match(UUID);
  if (!m) throw new Error(`no id in: ${out}`);
  return m[0];
}

test.afterAll(() => {
  for (const id of staff.splice(0)) sql(`update admin.admin_users set is_active = false where id = '${id}';`);
});

async function call(fnUrl: string, token: string, body: unknown) {
  const r = await fetch(fnUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function db(token: string) {
  const s = stack();
  return createClient(s.API, s.ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function signIn(email: string, password: string): Promise<string> {
  const s = stack();
  const c = createClient(s.API, s.ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return data.session!.access_token;
}

async function staffMember(prefix: string, role: string) {
  const who = await freshAccount(prefix);
  staff.push(who.id);
  sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${who.id}', '${role}', true)
         on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;`);
  return who;
}

/** A paid gateway invoice for a fresh seller, written past the immutability trigger. */
async function paidInvoice(payment: string, cols = "amount, gst_amount, total_paise", vals = "999, 179.82, null") {
  const seller = await freshAccount(`rf${tag}${Math.random().toString(36).slice(2, 6)}`, { seller: true });
  return idFrom(sql(`set session_replication_role = replica;
    insert into public.subscription_invoices (vendor_id, ${cols}, currency, status, payment_mode, document_type, razorpay_payment_id)
    select '${seller.id}', ${vals}, 'INR', 'paid', i.payment_mode, i.document_type, '${payment}'
      from public.subscription_invoices i limit 1
    returning id;`));
}

const invoice = (id: string) =>
  sql(`select coalesce(refund_status, 'null') || '|' || coalesce(razorpay_refund_id, 'null') || '|' || status from public.subscription_invoices where id = '${id}'`);

// ── #13 Refunds ──────────────────────────────────────────────────────────────
test.describe("#13 refunds (admin-refund-payment)", () => {
  test.skip(!REFUND_FN, "needs LOCAL_REFUND_FN_URL: the branch's admin-refund-payment on a mock Razorpay");

  test("a refund Razorpay marks failed can be tried again, and then goes through", async () => {
    const admin = (await sessionFor("admin")).access_token;
    const inv = await paidInvoice(`pay_flip_${tag}`);
    const first = await call(REFUND_FN!, admin, { invoiceId: inv });
    expect(first.body.refundStatus, JSON.stringify(first.body)).toBe("failed");
    expect(invoice(inv)).toMatch(/^failed\|rfnd_mock_\d+\|paid$/);

    const retry = await call(REFUND_FN!, admin, { invoiceId: inv });
    expect(retry.status, JSON.stringify(retry.body)).toBe(200);
    expect(retry.body.refundStatus).toBe("processed");
    expect(invoice(inv)).toMatch(/^processed\|rfnd_mock_\d+\|refunded$/);

    const again = await call(REFUND_FN!, admin, { invoiceId: inv });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("already_refunded");
  });

  // amount and gst_amount are whole rupees (integer columns), so the audit's "fractional paise" can't
  // happen; this checks the older-invoice path refunds base + GST, in paise.
  test("an older invoice without total_paise (₹999 + ₹180 GST) is refunded in full, in paise", async () => {
    const admin = (await sessionFor("admin")).access_token;
    const pay = `pay_legacy_${tag}`;
    const inv = await paidInvoice(pay, "amount, gst_amount, total_paise", "999, 180, null");
    const r = await call(REFUND_FN!, admin, { invoiceId: inv });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const calls = (await (await fetch(`${MOCK_RZP}/calls`)).json()) as { payment: string; amount: number }[];
    expect(calls.filter((c) => c.payment === pay).map((c) => c.amount)).toEqual([117900]);
  });

  test("a pending refund isn't sent to Razorpay a second time", async () => {
    const admin = (await sessionFor("admin")).access_token;
    const inv = await paidInvoice(`pay_pending_${tag}`);
    expect((await call(REFUND_FN!, admin, { invoiceId: inv })).body.refundStatus).toBe("pending");
    const second = await call(REFUND_FN!, admin, { invoiceId: inv });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("refund_in_progress");
  });

  test("a refund Razorpay took but the invoice couldn't record says so, and stays pending", async () => {
    const admin = (await sessionFor("admin")).access_token;
    const inv = await paidInvoice(`pay_norecord_${tag}`);
    // Make the final write fail, the way a trigger refusal or a dropped connection would.
    // A real function: the edge function's own database session can't see a pg_temp one.
    sql(`create or replace function public.zz_harness_refuse_record() returns trigger language plpgsql as $$
         begin if new.razorpay_refund_id is not null and new.id = '${inv}' then raise exception 'harness: refuse'; end if; return new; end $$;
         drop trigger if exists zz_harness_refuse on public.subscription_invoices;
         create trigger zz_harness_refuse before update on public.subscription_invoices for each row execute function public.zz_harness_refuse_record();`);
    try {
      const r = await call(REFUND_FN!, admin, { invoiceId: inv });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.ok).toBe(true);
      expect(r.body.recorded).toBe(false);
      expect(invoice(inv)).toBe("pending|null|paid");
      const again = await call(REFUND_FN!, admin, { invoiceId: inv });
      expect(again.body.error).toBe("refund_in_progress");
    } finally {
      sql(`drop trigger if exists zz_harness_refuse on public.subscription_invoices; drop function if exists public.zz_harness_refuse_record();`);
    }
  });
});

// ── #9 Staff temporary passwords ─────────────────────────────────────────────
test.describe("#9 staff temporary passwords (admin-staff + the database)", () => {
  test.skip(!STAFF_FN, "needs LOCAL_STAFF_FN_URL: the branch's admin-staff");

  async function register(role: string) {
    const admin = (await sessionFor("admin")).access_token;
    const who = `${role.replace(/_/g, "")}${tag}${Math.random().toString(36).slice(2, 7)}`;
    const r = await call(STAFF_FN!, admin, {
      action: "register", full_name: `Medium ${role} ${tag}`, personal_email: `medium.${who}@example.test`,
      phone: `+9197${String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-8)}`, admin_role: role,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.temporary_password, "email isn't configured locally, so the password is shown").toBeTruthy();
    const id = sql(`select user_id from admin.staff_members where work_email = '${r.body.work_email}'`);
    staff.push(id);
    return { id, email: r.body.work_email as string, temp: r.body.temporary_password as string };
  }

  test("an account on its temporary password can't use the API as staff; a breached choice is refused; its own one works", async () => {
    const s = await register("support");
    const meta = sql(`select raw_app_meta_data::text from auth.users where id = '${s.id}'`);
    expect(meta).toContain('"must_change_password": true');
    expect(meta).toContain("temp_password_issued_at");

    const tempToken = await signIn(s.email, s.temp);
    const refused = await db(tempToken).rpc("admin_profile_search", { p_term: "Local", p_limit: 5 });
    expect(refused.error?.code, "support may search, but not on a temporary password").toBe("42501");

    const breached = await call(STAFF_FN!, tempToken, { action: "set_password", password: "password12345" });
    expect(breached.status, JSON.stringify(breached.body)).toBe(400);
    expect(breached.body.error).toBe("breached_password");

    const own = `Kx7-${tag}-q9Vm2wPz`;
    const ok = await call(STAFF_FN!, tempToken, { action: "set_password", password: own });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const fresh = await signIn(s.email, own);
    const allowed = await db(fresh).rpc("admin_profile_search", { p_term: "Local", p_limit: 5 });
    expect(allowed.error).toBeNull();
    expect(sql(`select raw_app_meta_data->>'must_change_password' from auth.users where id = '${s.id}'`)).toBe("false");
  });

  test("a temporary password older than 72 hours can't be used to choose one", async () => {
    const s = await register("support");
    sql(`update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('temp_password_issued_at', to_char((now() - interval '73 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
         where id = '${s.id}'`);
    const tempToken = await signIn(s.email, s.temp);
    const r = await call(STAFF_FN!, tempToken, { action: "set_password", password: `Zq4-${tag}-Lm8nRt` });
    expect(r.status, JSON.stringify(r.body)).toBe(410);
    expect(r.body.error).toBe("temporary_password_expired");
  });

  test("a manager can't reset a deactivated super admin's password, and can a team member's", async () => {
    const sa = await register("super_admin");
    const team = await register("vendor_ops");
    sql(`update admin.admin_users set is_active = false where id in ('${sa.id}', '${team.id}')`);
    const manager = await staffMember(`mgr${tag}`, "manager");
    const refused = await call(STAFF_FN!, manager.session.access_token, { action: "reset_password", user_id: sa.id });
    expect(refused.status, JSON.stringify(refused.body)).toBe(403);
    expect(refused.body.temporary_password ?? null).toBeNull();
    const allowed = await call(STAFF_FN!, manager.session.access_token, { action: "reset_password", user_id: team.id });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  });
});

// ── #11 Token refresh ────────────────────────────────────────────────────────
test("#11 a token refresh doesn't replace the page: what's typed survives", async ({ browser }) => {
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/accounts`);
  const box = page.getByRole("textbox", { name: "Search by name or email" });
  await box.fill(`unsaved ${tag}`);
  await page.evaluate(async () => {
    const m = await import("/src/lib/supabase.ts");
    const { error } = await m.supabase.auth.refreshSession();
    if (error) throw new Error(error.message);
  });
  await page.waitForTimeout(1500);
  await expect(page.getByText("Checking admin access")).toHaveCount(0);
  await expect(box).toHaveValue(`unsaved ${tag}`);
  await ctx.close();
});

// ── #12 Stale approve ────────────────────────────────────────────────────────
test("#12 approving from a stale queue doesn't publish a listing the vendor pulled back", async ({ browser }) => {
  const seller = await freshAccount(`stale${tag}`, { seller: true });
  const name = `Stale ${tag} kurta`;
  const id = idFrom(sql(`set session_replication_role = replica;
    insert into public.products (vendor_id, name, status, price_value, moq) values ('${seller.id}', '${name}', 'under_review', 10, '10') returning id;`));
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/products`);
  const card = page.locator("div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "Approve", exact: true }) }).last();
  await expect(card).toBeVisible({ timeout: 30_000 });
  // The vendor pulls it back to draft while the queue is open.
  sql(`set session_replication_role = replica; update public.products set status = 'draft' where id = '${id}';`);
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/This changed since the list loaded: it is now "draft"/)).toBeVisible({ timeout: 15_000 });
  expect(sql(`select status from public.products where id = '${id}'`)).toBe("draft");
  sql(`delete from public.products where id = '${id}'`);
  await ctx.close();
});

// ── #14 Ads ──────────────────────────────────────────────────────────────────
// The audit said a scheduled campaign had no tab. It has one, on the Review view (Reject / Suspend): the
// claim looked only at the Moderation view. That is checked here, and the pause wording, which was wrong.
test("#14 a scheduled campaign is on Review › Scheduled; pausing says only Cosora can resume", async ({ browser }) => {
  const seller = await freshAccount(`sched${tag}`, { seller: true });
  const scheduled = `Scheduled ${tag} sale`;
  const active = `Active ${tag} sale`;
  const ids = sql(`set session_replication_role = replica;
    insert into public.advertisements (vendor_id, title, status, starts_at, ends_at) values
      ('${seller.id}', '${scheduled}', 'scheduled', now() + interval '3 days', now() + interval '10 days'),
      ('${seller.id}', '${active}', 'active', now() - interval '1 day', now() + interval '10 days')
    returning id;`).match(new RegExp(UUID.source, "g"))!;
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/ads`);
  await page.getByRole("button", { name: "Scheduled", exact: true }).first().click();
  const sCard = page.locator("div").filter({ has: page.getByRole("heading", { name: scheduled }) }).filter({ has: page.getByRole("button", { name: "Suspend" }) }).last();
  await expect(sCard.getByRole("button", { name: "Reject" })).toBeVisible({ timeout: 30_000 });
  await expect(sCard.getByRole("button", { name: "Suspend" })).toBeVisible();

  // The view switch at the top, not the sidebar group of the same name.
  await page.getByRole("radio", { name: "Moderation" }).click();
  const aCard = page.locator("div").filter({ has: page.getByRole("heading", { name: active }) }).filter({ has: page.getByRole("button", { name: "Pause" }) }).last();
  await aCard.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText(/Only Cosora can resume it/)).toBeVisible();
  await expect(page.getByText(/The vendor can resume this campaign themselves/)).toHaveCount(0);
  sql(`delete from public.advertisements where id in ('${ids.join("','")}')`);
  await ctx.close();
});

// ── #13 Refund screens ───────────────────────────────────────────────────────
test("#13 a failed refund shows as failed and can be tried again on Subscriptions", async ({ browser }) => {
  const inv = await paidInvoice(`pay_uifail_${tag}`, "amount, gst_amount, total_paise, refund_status, razorpay_refund_id, invoice_number",
    `999, 0, 99900, 'failed', 'rfnd_ui_${tag}', 'MED-${tag}'`);
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/subscriptions`);
  const row = page.locator("tr").filter({ hasText: `MED-${tag}` });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByText("failed", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: /refund/i })).toBeEnabled();
  sql(`set session_replication_role = replica; delete from public.subscription_invoices where id = '${inv}';`);
  await ctx.close();
});


// ── #7 Breached passwords where staff set one by link (ResetPassword: set-password and reset) ─────────────
test("#7 the set-password page's check refuses a breached password and the weak rule, and passes a strong one", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/login`);
  const out = await page.evaluate(async () => {
    const m = await import("/src/lib/pwnedPassword.ts");
    return {
      breached: await m.isBreachedPassword("password12345"),
      strong: await m.isBreachedPassword(`Qz9-${crypto.randomUUID()}`),
      short: m.passwordRuleProblem("abc12345"),
      noDigit: m.passwordRuleProblem("abcdefghijkl"),
      ok: m.passwordRuleProblem("abcdefghij12"),
    };
  });
  expect(out.breached).toBe(true);
  expect(out.strong).toBe(false);
  expect(out.short).toMatch(/at least 10 characters/);
  expect(out.noDigit).toMatch(/letters and numbers/);
  expect(out.ok).toBeNull();
  await ctx.close();
});
