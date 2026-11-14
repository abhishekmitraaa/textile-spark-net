/**
 * Ranking Standing (documentation/ranking-standing-design-2026-11-15.md), on the local stack only.
 * A buyer's quotes open in Recommended order: the better-standing seller first, whatever arrived first.
 * The score itself is covered case by case in scripts/ranking/standing.sql.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

test("My Quotes opens on Recommended, best-standing seller first, and the other sorts still work", async ({ browser }) => {
  const tag = Date.now().toString(36);
  const buyer = await freshAccount(`stq${tag}`);
  const [low, high] = sql(`select id from public.vendor_profiles where brand_name is not null order by id limit 2`).split("\n");
  const title = `ST quotes ${tag}`;
  const rfq = sql(`set session_replication_role = replica;
    insert into public.rfqs (buyer_id, title, status, quantity) values ('${buyer.id}', '${title}', 'active', 100) returning id`)
    .split("\n").map((l) => l.trim()).find((l) => /^[0-9a-f-]{36}$/.test(l))!;
  // The low-standing seller quotes first and cheaper, so neither "Most Recent" nor "Lowest Price" puts the other first.
  sql(`set session_replication_role = replica;
    insert into public.quotes (rfq_id, vendor_id, price_per_unit, price_inr, status, created_at) values
      ('${rfq}', '${low}', 50, 50, 'pending', now() - interval '2 hours'),
      ('${rfq}', '${high}', 90, 90, 'pending', now() - interval '1 hour');
    insert into admin.vendor_standing (vendor_id, standing, i, r, a, t, p) values ('${low}', 0.1, 0, 0, 0, 0, 0), ('${high}', 0.9, 0, 0, 0, 0, 0)
      on conflict (vendor_id) do update set standing = excluded.standing`);
  const names = sql(`select string_agg(coalesce(brand_name, 'Vendor'), '|' order by array_position(array['${low}','${high}']::uuid[], id))
                     from public.vendor_profiles where id in ('${low}', '${high}')`).split("|");
  try {
    const ctx = await contextWithSession(browser, buyer.session, { width: 1280, height: 900 });
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/requirement/my-quotes`);
    await page.getByText(title).first().click();
    await expect(page.getByRole("button", { name: /Recommended/ })).toBeVisible();
    const cards = page.locator('[data-testid="received-quote"]');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText(names[1]);

    await page.getByRole("button", { name: /Recommended/ }).click();
    await page.getByRole("menuitem", { name: "Lowest Price" }).click();
    await expect(cards.first()).toContainText(names[0]);
    await ctx.close();
  } finally {
    sql(`delete from public.quotes where rfq_id = '${rfq}'; delete from public.rfqs where id = '${rfq}';
         select admin.refresh_vendor_standing();`);
  }
});
