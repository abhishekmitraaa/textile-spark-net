/**
 * Subscriptions P6 (2026-10-09): lead alerts, on the local stack.
 *   * A Gold seller the lead_alerts switch lists reaches the Lead alerts page from Leads and
 *     from the sidebar. It says what the plan includes and what is being sent today (WhatsApp
 *     and SMS wait for approvals; the daily summary for its scheduled job, which the local
 *     stack doesn't have). A buyer's requirement then shows in "What you've been told", and
 *     turning instant alerts off is saved.
 *   * A seller with no plan is sent to the plans with a line saying why, and has no link.
 *   * Cosora-Admin names the switch and shows the lead alert figures on Leads.
 * Matching, pacing and the digest are checked by scripts/subscriptions/p6_lead_alerts.sql and
 * the end-to-end run in test.md. afterEach removes what each test made.
 */
import { expect, test } from "@playwright/test";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, watchErrors,
} from "./stack";

const FLAG = "lead_alerts";
const sellers: string[] = [];
const buyers: string[] = [];

test.afterEach(() => {
  while (buyers.length) sql(`delete from public.rfqs where buyer_id = '${buyers.pop()}';`);
  while (sellers.length) {
    const id = sellers.pop() as string;
    disallowFeature(FLAG, id);
    sql(`delete from public.notifications where profile_id = '${id}';
         delete from public.lead_alert_settings where vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_subscriptions where vendor_id = '${id}';`);
  }
});

const category = () => sql(`select id from public.categories where name = 'Activewear' limit 1`);

/** A seller on the switch who lists in Activewear, on `plan` (or no plan). */
async function seller(prefix: string, plan: string | null) {
  const who = await freshAccount(prefix, { seller: true });
  sellers.push(who.id);
  allowFeature(FLAG, who.id);
  sql(`insert into public.products (vendor_id, name, status, category_id, price_value) values ('${who.id}', 'P6 Track Pants', 'live', '${category()}', 150);`);
  if (plan) {
    sql(`insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
         values ('${who.id}', '${plan}', 'monthly', 'active', now() - interval '3 days', now() + interval '27 days');`);
  }
  return who;
}

/** A buyer posts a requirement in Activewear (the trigger matches and tells vendors). */
async function postRequirement(title: string) {
  const buyer = await freshAccount("p6-buyer");
  buyers.push(buyer.id);
  sql(`insert into public.buyer_profiles (id) values ('${buyer.id}') on conflict (id) do nothing;
       insert into public.rfqs (buyer_id, title, category_id, quantity) values ('${buyer.id}', '${title}', '${category()}', 400);`);
}

test("a Gold seller sees how they're told, what they were told, and changes a choice", async ({ browser }) => {
  test.setTimeout(150_000);
  const who = await seller("p6-gold", "gold");
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // From Leads, and in the sidebar.
  await page.goto(`${BUYER_URL}/leads`);
  await expect(page.getByRole("link", { name: "Lead alerts", exact: true })).toBeVisible();
  await page.getByTestId("lead-alerts-link").click();
  await expect(page).toHaveURL(/\/lead-alerts$/);
  await expect(page.getByRole("heading", { name: "Lead alerts", level: 1 })).toBeVisible();

  // What the plan includes, and honestly what is being sent today.
  const channels = page.getByTestId("lead-alert-channels");
  await expect(channels).toContainText("Your Gold plan includes:");
  await expect(channels.getByTestId("lead-channel-app")).toHaveAttribute("data-live", "true");
  await expect(channels.getByTestId("lead-channel-email")).toHaveAttribute("data-live", "true");
  await expect(channels.getByTestId("lead-channel-whatsapp")).toHaveAttribute("data-live", "false");
  await expect(channels.getByTestId("lead-channel-whatsapp")).toContainText("Starting soon");
  await expect(channels.getByTestId("lead-channel-digest")).toHaveCount(0);   // Gold is told as it happens
  await expect(page.getByTestId("lead-alert-history")).toContainText("Nothing yet.");

  // A buyer posts; the seller was told by the bell (their owner email isn't set, so no email).
  await postRequirement("P6 spec 400 track pants");
  expect(sql(`select count(*) from public.notifications where profile_id = '${who.id}' and kind = 'lead_match' and title = 'New requirement: P6 spec 400 track pants'`)).toBe("1");
  await page.reload();
  const history = page.getByTestId("lead-alert-history");
  await expect(history).toContainText("P6 spec 400 track pants");
  await expect(history).toContainText("Activewear");
  await expect(history).toContainText("Bell");

  // A choice is saved as it changes.
  const instant = page.getByRole("switch", { name: "Alerts as they happen" });
  await expect(instant).toBeChecked();
  await instant.click();
  await expect(instant).not.toBeChecked();
  await expect.poll(() => sql(`select instant::text from public.lead_alert_settings where vendor_id = '${who.id}'`)).toBe("false");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a seller with no plan is sent to the plans, and has no Lead alerts link", async ({ browser }) => {
  const who = await seller("p6-free", null);
  const ctx = await contextWithSession(browser, who.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/lead-alerts`);
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("Lead alerts come with a paid plan")).toBeVisible();
  await page.goto(`${BUYER_URL}/leads`);
  await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lead alerts", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("lead-alerts-link")).toHaveCount(0);
  await ctx.close();
});

test("Cosora-Admin names the switch and shows the lead alert figures", async ({ browser }) => {
  test.setTimeout(120_000);
  await seller("p6-admin", "silver");
  await postRequirement("P6 spec counted");

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/feature-flags`);
  await expect(page.getByTestId(`flag-${FLAG}`)).toContainText("Lead alerts");

  await page.goto(`${ADMIN_URL}/leads`);
  const stats = page.getByTestId("lead-alert-stats");
  await expect(stats).toBeVisible();
  await expect(stats).toContainText(/\d+ requirements? matched/);
  await expect(stats).toContainText(/\d+ as they happened/);
  expect(errors).toEqual([]);
  await ctx.close();
});
