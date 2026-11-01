/**
 * Ranking Fit (documentation/ranking-fit-design-2026-11-01.md), on the local stack only.
 * 2a: a lead from a buyer in the vendor's state ranks above an otherwise equal one and says "Near you".
 * The scoring itself is covered case by case in scripts/ranking/fit_match.sql.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, freshAccount, service, signedInContext, sql } from "./stack";

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
