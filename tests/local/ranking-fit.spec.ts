/**
 * Ranking Fit (documentation/ranking-fit-design-2026-11-01.md), on the local stack only.
 * 2a: a lead from a buyer in the vendor's state ranks above an otherwise equal one and says "Near you".
 * 3a/3b: a buyer with no state is asked for one on Profile and My Quotes, never on the requirement form.
 * The scoring itself is covered case by case in scripts/ranking/fit_match.sql.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, service, signedInContext, sql } from "./stack";

const VENDOR = "22222222-2222-2222-2222-222222222222";

test("2a: a near lead ranks first and shows Near you", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const db = service();
  const before = sql(`select coalesce(state, '') from public.vendor_profiles where id = '${VENDOR}'`).trim();
  const nearBuyer = await freshAccount(`fitn${tag}`);
  const farBuyer = await freshAccount(`fitf${tag}`);
  sql(`update public.vendor_profiles set state = 'Gujarat' where id = '${VENDOR}'`);
  sql(`insert into public.buyer_profiles (id, state) values ('${nearBuyer.id}', 'Gujarat'), ('${farBuyer.id}', 'Maharashtra')
       on conflict (id) do update set state = excluded.state`);
  const near = `FIT near ${tag}`;
  const far = `FIT far ${tag}`;
  // The far lead is posted last, so without Fit it would be listed first (newest first within a tie).
  await db.from("rfqs").insert({ buyer_id: nearBuyer.id, title: near, status: "active", quantity: 100 });
  await db.from("rfqs").insert({ buyer_id: farBuyer.id, title: far, status: "active", quantity: 100 });
  try {
    const ctx = await signedInContext(browser, "vendor", { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/leads`);
    const nearCard = page.locator("div.rounded-xl.border").filter({ hasText: near });
    const farCard = page.locator("div.rounded-xl.border").filter({ hasText: far });
    await expect(nearCard).toBeVisible();
    await expect(farCard).toBeVisible();
    await expect(nearCard.getByText("Near you")).toBeVisible();
    await expect(farCard.getByText("Near you")).toHaveCount(0);
    const [n, f] = [await nearCard.boundingBox(), await farCard.boundingBox()];
    expect(n!.y).toBeLessThan(f!.y);
    await ctx.close();
  } finally {
    sql(`delete from public.rfqs where title in ('${near}', '${far}')`);
    sql(`update public.vendor_profiles set state = nullif('${before.replace(/'/g, "''")}', '') where id = '${VENDOR}'`);
  }
});

test("3a: Profile asks for the state first, opens the state picker, then falls back to the city nudge", async ({ browser }) => {
  const buyer = await freshAccount(`fits${Date.now().toString(36)}`);
  const ctx = await contextWithSession(browser, buyer.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/profile`);
  await expect(page.getByText("Add your state")).toBeVisible();
  await expect(page.getByText("so suppliers near you see your requirements sooner.")).toBeVisible();
  // One banner slot: the city nudge waits for the state.
  await expect(page.getByText("Add your city")).toHaveCount(0);
  await page.getByRole("button", { name: "Add state" }).click();
  await expect(page).toHaveURL(/\/profile\/business-details\?focus=state/);
  await expect(page.locator("#bd-state")).toBeFocused();
  await page.locator("#bd-state").selectOption({ label: "Gujarat" });
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText("Add your city")).toBeVisible();
  await expect(page.getByText("Add your state")).toHaveCount(0);
  expect(sql(`select state_code from public.buyer_profiles where id = '${buyer.id}'`)).toBe("GJ");
  await ctx.close();
});

test("3b: My Quotes asks for the state until there is one; the requirement form never does", async ({ browser }) => {
  const buyer = await freshAccount(`fitq${Date.now().toString(36)}`);
  const ctx = await contextWithSession(browser, buyer.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/requirement/my-quotes`);
  await expect(page.getByText("Add your state")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Add your state")).toHaveCount(0);
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Add your state")).toHaveCount(0);
  sql(`insert into public.buyer_profiles (id, state) values ('${buyer.id}', 'Kerala') on conflict (id) do update set state = excluded.state`);
  await page.goto(`${BUYER_URL}/requirement/my-quotes`);
  await expect(page.getByRole("heading", { name: "My Quotes" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Add your state")).toHaveCount(0);
  await ctx.close();
});
