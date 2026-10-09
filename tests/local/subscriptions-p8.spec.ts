/**
 * Subscriptions P8 (2026-10-09): the CRM, on the local stack.
 *   * A Silver seller tracks a requirement from Leads, finds it on the CRM board (from the
 *     menu), moves it, gives it a value, plans a follow-up and adds a note; the history shows
 *     each; the follow-up is on Follow-ups and is marked done there. Sending a quote moves the
 *     lead to Quoted by itself.
 *   * On a phone the CRM is a list; a lead added by hand opens straight away.
 *   * Gold sees the analytics; Silver is sent to the plans from them; a seller with no plan
 *     from the CRM, and sees no "Track in CRM" on Leads.
 *   * Cosora-Admin names the switch.
 * The rules behind it are checked by scripts/subscriptions/p8_crm.sql and the end-to-end run in
 * test.md. afterEach removes what each test made.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, watchErrors,
} from "./stack";

const FLAG = "crm";
const sellers: string[] = [];
const buyers: string[] = [];

test.afterEach(() => {
  while (buyers.length) {
    const id = buyers.pop() as string;
    sql(`delete from public.quotes where rfq_id in (select id from public.rfqs where buyer_id = '${id}');
         delete from public.rfqs where buyer_id = '${id}';`);
  }
  while (sellers.length) {
    const id = sellers.pop() as string;
    disallowFeature(FLAG, id);
    sql(`delete from public.vendor_lead_pipeline where vendor_id = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
});

const category = () => sql(`select id from public.categories where name = 'Activewear' limit 1`);

async function seller(prefix: string, plan: string | null) {
  const who = await freshAccount(prefix, { seller: true });
  sellers.push(who.id);
  allowFeature(FLAG, who.id);
  sql(`insert into public.products (vendor_id, name, status, category_id, price_value) values ('${who.id}', 'P8 Track Pants', 'live', '${category()}', 150);`);
  if (plan) {
    sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
         values ('${who.id}', '${plan}', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  }
  return who;
}

async function requirement(title: string) {
  const buyer = await freshAccount("p8-buyer");
  buyers.push(buyer.id);
  sql(`insert into public.buyer_profiles (id, country, country_code) values ('${buyer.id}', 'India', 'IN') on conflict (id) do nothing;
       insert into public.rfqs (buyer_id, title, category_id, quantity) values ('${buyer.id}', '${title}', '${category()}', 600);`);
  return sql(`select id from public.rfqs where title = '${title}'`);
}

test("a Silver seller tracks a lead, works it on the board, and keeps a follow-up", async ({ browser }) => {
  test.setTimeout(180_000);
  const who = await seller("p8-silver", "silver");
  const rfq = await requirement("P8 spec 600 track jackets");
  const ctx = await contextWithSession(browser, who.session, { width: 1360, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // Leads: track it.
  await page.goto(`${BUYER_URL}/leads`);
  const card = page.locator("div.rounded-xl", { hasText: "P8 spec 600 track jackets" });
  await card.getByTestId("crm-track").click();
  await expect(card.getByTestId("crm-tracked")).toHaveText("In your CRM");

  // The CRM, from the menu: on the board under New.
  await page.getByRole("link", { name: "CRM", exact: true }).click();
  await expect(page).toHaveURL(/\/crm$/);
  await expect(page.getByTestId("crm-column-new").getByTestId("crm-lead")).toContainText("P8 spec 600 track jackets");
  await page.getByTestId("crm-column-new").getByTestId("crm-lead").click();

  const sheet = page.getByTestId("crm-lead-sheet");
  await sheet.getByTestId("crm-stage-select").selectOption("contacted");
  await expect(page.getByTestId("crm-column-contacted").getByTestId("crm-lead")).toContainText("P8 spec 600 track jackets");
  await sheet.getByTestId("crm-value").fill("90000");
  await sheet.getByTestId("crm-save-details").click();
  await expect.poll(() => sql(`select value_inr from public.vendor_lead_pipeline where vendor_id = '${who.id}' and rfq_id = '${rfq}'`)).toBe("90000.00");
  await sheet.getByPlaceholder("What to do").fill("Send fabric swatches");
  await sheet.getByTestId("crm-add-follow-up").click();
  await expect(sheet.getByTestId("crm-follow-ups")).toContainText("Send fabric swatches");
  await sheet.getByPlaceholder("Add a note").fill("Buyer wants navy and olive");
  await sheet.getByTestId("crm-add-note").click();
  const history = sheet.getByTestId("crm-history");
  await expect(history).toContainText("Buyer wants navy and olive");
  await expect(history).toContainText("You moved it to Contacted");
  await expect(history).toContainText("You added it as New");
  await page.keyboard.press("Escape");

  // A quote sent moves it to Quoted by itself.
  sql(`insert into public.quotes (rfq_id, vendor_id, price_per_unit) values ('${rfq}', '${who.id}', 155);`);
  await page.reload();
  await expect(page.getByTestId("crm-column-quoted").getByTestId("crm-lead")).toContainText("P8 spec 600 track jackets");

  // Follow-ups: there, and done.
  await page.goto(`${BUYER_URL}/crm/follow-ups`);
  await expect(page.getByRole("heading", { name: "Follow-ups", level: 1 })).toBeVisible();
  await expect(page.getByText("Send fabric swatches")).toBeVisible();
  await page.getByTestId("crm-follow-up-done").click();
  await expect(page.getByTestId("crm-follow-ups-empty")).toBeVisible();
  expect(sql(`select count(*) from public.vendor_lead_followups where vendor_id = '${who.id}' and done_at is not null`)).toBe("1");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("on a phone the CRM is a list, and a lead added by hand opens", async ({ browser }) => {
  test.setTimeout(120_000);
  const who = await seller("p8-phone", "silver");
  const ctx = await contextWithSession(browser, who.session, { width: 390, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/crm`);
  await expect(page.getByTestId("crm-empty")).toBeVisible();
  await page.getByTestId("crm-add-lead").click();
  await page.getByLabel("What they need").fill("Fair contact: 1,000 hoodies");
  await page.getByLabel("Buyer").fill("Asha Exports");
  await page.getByTestId("crm-add-lead-save").click();
  const sheet = page.getByTestId("crm-lead-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "Fair contact: 1,000 hoodies" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("crm-list").getByTestId("crm-lead")).toContainText("Asha Exports");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("analytics are Gold's; Silver and a seller with no plan are sent to the plans", async ({ browser }) => {
  test.setTimeout(150_000);
  const gold = await seller("p8-gold", "gold");
  sql(`insert into public.vendor_lead_pipeline (vendor_id, title, stage, value_inr, source, closed_at) values
         ('${gold.id}', 'P8 spec won', 'won', 50000, 'manual', now()),
         ('${gold.id}', 'P8 spec open', 'quoted', 20000, 'manual', null);`);
  let ctx = await contextWithSession(browser, gold.session, { width: 1280, height: 1000 });
  let page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/crm`);
  await page.getByTestId("crm-analytics-link").click();
  await expect(page.getByRole("heading", { name: "CRM analytics", level: 1 })).toBeVisible();
  await expect(page.getByTestId("crm-stat-open")).toContainText("₹20K");
  await expect(page.getByTestId("crm-stat-won")).toContainText("₹50K");
  await expect(page.getByTestId("crm-stat-win-rate")).toContainText("100%");
  await expect(page.getByTestId("crm-funnel")).toContainText("Won");
  expect(errors).toEqual([]);
  await ctx.close();

  const silver = await seller("p8-silver-a", "silver");
  ctx = await contextWithSession(browser, silver.session, { width: 1280, height: 1000 });
  page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/crm/analytics`);
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("CRM analytics come with Gold and VIP")).toBeVisible();
  await ctx.close();

  const free = await seller("p8-free", null);
  await requirement("P8 spec free cannot track");
  ctx = await contextWithSession(browser, free.session, { width: 1280, height: 1000 });
  page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/crm`);
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("The CRM comes with Silver, Gold and VIP")).toBeVisible();
  await page.goto(`${BUYER_URL}/leads`);
  await expect(page.locator("div.rounded-xl", { hasText: "P8 spec free cannot track" })).toBeVisible();
  await expect(page.getByTestId("crm-track")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "CRM", exact: true })).toHaveCount(0);
  await ctx.close();
});

test("Cosora-Admin names the CRM switch", async ({ browser }) => {
  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_URL}/feature-flags`);
  await expect(page.getByTestId(`flag-${FLAG}`)).toContainText("CRM");
  await ctx.close();
});
