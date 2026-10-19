/**
 * Serious fixes from the 2026-10-20 admin audit (migration 20261020120000 + Cosora-Admin
 * fix/serious-2026-10-20). Local stack only; needs both apps.
 *   1. Every admin role lands on a page after signing in (super_admin, manager and
 *      product_moderator used to bounce between "/" and "/rfq-review" for ever).
 *   2. A requirement with 5 photos is approved into a live requirement (rfqs allowed 3).
 *   4. A buyer can't store a "javascript:" photo address on a requirement.
 *   5. Account search and emails answer only the roles whose pages use them.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { ADMIN_URL, contextWithSession, freshAccount, signedInContext, sql, stack } from "./stack";

const tag = Date.now().toString(36);
const staff: string[] = [];
const buyers: string[] = [];

test.afterAll(() => {
  for (const id of staff.splice(0)) sql(`update admin.admin_users set is_active = false where id = '${id}';`);
  for (const b of buyers.splice(0)) {
    sql(`delete from public.rfqs where buyer_id = '${b}'; delete from public.rfq_submissions where buyer_id = '${b}';
         delete from public.notifications where profile_id = '${b}';`);
  }
});

async function staffMember(prefix: string, role: string) {
  const who = await freshAccount(prefix);
  staff.push(who.id);
  sql(`insert into admin.admin_users (id, admin_role, is_active) values ('${who.id}', '${role}', true)
         on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;`);
  return who;
}

function clientFor(accessToken: string) {
  const s = stack();
  return createClient(s.API, s.ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const LANDING: [role: string, path: string, heading: RegExp][] = [
  ["super_admin", "/requirement-review", /Requirement review/],
  ["manager", "/requirement-review", /Requirement review/],
  ["product_moderator", "/requirement-review", /Requirement review/],
  ["account_manager", "/my-vendors", /My vendors/],
];

for (const [role, path, heading] of LANDING) {
  test(`1. a ${role} lands on ${path} after signing in, and stays there`, async ({ browser }) => {
    const who = await staffMember(`land${role.replace(/_/g, "")}${tag}`, role);
    const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${ADMIN_URL}/`);
    await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(new RegExp(`${path}$`)); // no bounce back to "/"
    await ctx.close();
  });
}

test("2. a requirement with 5 photos is approved into a live requirement with all 5", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`five${tag}`);
  buyers.push(buyer.id);
  const title = `Five photos ${tag}`;
  const photos = [1, 2, 3, 4, 5].map((n) => `${stack().API}/storage/v1/object/public/rfq-images/${buyer.id}/p${n}.jpg`);
  sql(`insert into public.rfq_submissions (buyer_id, title, product_name, quantity, image, images)
       values ('${buyer.id}', '${title}', '${title}', 40, '${photos[0]}', array['${photos.join("','")}'])`);

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const admin = await ctx.newPage();
  await admin.goto(`${ADMIN_URL}/requirement-review`);
  const card = admin.getByTestId("rfq-submission-card").filter({ hasText: title });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  expect(sql(`select cardinality(images) from public.rfqs where buyer_id = '${buyer.id}' and title = '${title}'`)).toBe("5");
  await ctx.close();
});

test("4. a buyer can't store a javascript: photo address on a requirement", async () => {
  const buyer = await freshAccount(`jsimg${tag}`);
  buyers.push(buyer.id);
  const db = clientFor(buyer.session.access_token);
  const { error } = await db.from("rfq_submissions").insert({
    buyer_id: buyer.id, title: `js ${tag}`, product_name: `js ${tag}`, quantity: 1,
    images: ["javascript:alert(document.domain)"],
  });
  expect(error?.message ?? "").toMatch(/rfq_submissions_image_urls_web/);
  expect(sql(`select count(*) from public.rfq_submissions where buyer_id = '${buyer.id}'`)).toBe("0");
});

test("5. account search and emails answer only the roles whose pages use them", async ({ browser }) => {
  test.setTimeout(120_000);
  const local = "11111111-1111-1111-1111-111111111111";
  for (const role of ["delivery_team", "ads_moderator", "account_manager", "finance_admin"]) {
    const who = await staffMember(`nosearch${role.replace(/_/g, "")}${tag}`, role);
    const db = clientFor(who.session.access_token);
    const search = await db.rpc("admin_profile_search", { p_term: "Local", p_limit: 50 });
    expect(search.error?.code, `${role} search`).toBe("42501");
    const emails = await db.rpc("admin_profile_emails", { p_ids: [local] });
    expect(emails.error?.code, `${role} emails`).toBe("42501");
  }

  const vops = await staffMember(`vops${tag}`, "vendor_ops");
  const vdb = clientFor(vops.session.access_token);
  expect((await vdb.rpc("admin_profile_search", { p_term: "Local", p_limit: 5 })).error?.code).toBe("42501");
  const vEmails = await vdb.rpc("admin_profile_emails", { p_ids: [local] });
  expect(vEmails.error).toBeNull();
  expect(vEmails.data).toHaveLength(1);

  // Support still finds people on Accounts, and "__" no longer matches everyone.
  const support = await staffMember(`sup${tag}`, "support");
  const sdb = clientFor(support.session.access_token);
  const wild = await sdb.rpc("admin_profile_search", { p_term: "__", p_limit: 500 });
  expect(wild.error).toBeNull();
  expect(wild.data).toHaveLength(0);
  const ctx = await contextWithSession(browser, support.session, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/accounts`);
  await page.getByRole("textbox", { name: "Search by name or email" }).fill("Local Buyer");
  await expect(page.getByText("local-buyer@cosora.test").first()).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});
