/**
 * The buyer's Following page and follower counts (2026-10-10), on the local stack.
 *   * A buyer follows two of three sellers (one from the seller's store page, one through the API). The
 *     page's "Your Followings", "Following Top Performing" and "Following New-In" show those two sellers
 *     and their listings only. The third seller's listings appear nowhere but "Most Popular", the
 *     catalogue-wide section the page labels as such and shows once the followed feed runs out.
 *   * Each follow and unfollow moves the seller's follower count (20261010125031_follower_count), and the
 *     store page shows the new number.
 *   * A seller looking at their own store is told they can't follow themselves, and their own business
 *     isn't offered on their Following page.
 * afterEach removes the follows and listings each run made.
 */
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { BUYER_URL, contextWithSession, freshAccount, sql, stack, watchErrors } from "./stack";

const made: string[] = [];
test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    sql(`delete from public.follows where follower_id = '${id}' or vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';`);
  }
});

const tag = Date.now().toString(36);
const followers = (id: string) => Number(sql(`select followers_count from public.vendor_profiles where id = '${id}'`));

async function sellerWithListings(letter: string) {
  const who = await freshAccount(`fl${letter}${tag}`, { seller: true });
  made.push(who.id);
  sql(`insert into public.products (vendor_id, name, status, price_value) values
         ('${who.id}', 'FL ${tag} ${letter}1', 'live', 120), ('${who.id}', 'FL ${tag} ${letter}2', 'live', 140);`);
  return { ...who, brand: `fl${letter}${tag} Textiles`, products: [`FL ${tag} ${letter}1`, `FL ${tag} ${letter}2`] };
}

/** The <section> under a heading, or null when the page doesn't show it. */
const section = (page: Page, heading: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
/** A listing card's picture carries the listing's name. */
const card = (scope: ReturnType<typeof section> | Page, name: string) => scope.getByRole("img", { name, exact: true });

test("the Following feed shows only the sellers the buyer follows, and follows move the counts", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await sellerWithListings("a");
  const b = await sellerWithListings("b");
  const c = await sellerWithListings("c");
  const buyer = await freshAccount(`flbuyer${tag}`);
  made.push(buyer.id);

  const ctx = await contextWithSession(browser, buyer.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // Follow A from A's store page, the way a buyer does.
  await page.goto(`${BUYER_URL}/vendor/${a.id}`);
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unfollow", exact: true })).toBeVisible();
  await expect.poll(() => followers(a.id)).toBe(1);
  await page.reload();
  await expect(page.getByText("Followers", { exact: true }).locator("xpath=following-sibling::p[1]")).toHaveText("1");

  // Follow B through the API, as any client can.
  const s = stack();
  const api = createClient(s.API, s.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${buyer.session.access_token}` } } });
  const { error } = await api.from("follows").insert({ follower_id: buyer.id, vendor_id: b.id });
  expect(error).toBeNull();
  expect(followers(b.id)).toBe(1);
  expect(followers(c.id)).toBe(0);

  await page.goto(`${BUYER_URL}/home/followings`);
  const yours = section(page, "Your Followings");
  await expect(yours.getByText(a.brand, { exact: true })).toBeVisible();
  await expect(yours.getByText(b.brand, { exact: true })).toBeVisible();
  await expect(yours.getByText(c.brand, { exact: true })).toHaveCount(0);

  const newIn = section(page, "Following New-In");
  for (const name of [...a.products, ...b.products]) await expect(card(newIn, name).first()).toBeVisible();
  for (const name of c.products) await expect(card(newIn, name)).toHaveCount(0);

  const top = section(page, "Following Top Performing");
  await expect(top).toBeVisible();
  for (const name of c.products) await expect(card(top, name)).toHaveCount(0);
  expect(await top.getByRole("img").count()).toBeGreaterThan(0);

  // C's listings show only in the two sections the page labels as beyond the buyer's follows: "Most Popular"
  // (Cosora-wide, once the followed feed runs out) and "Looking for New Brands?" (brands to follow, with two
  // of their listings each).
  const popular = section(page, "Most Popular");
  const discover = section(page, "Looking for New Brands?");
  for (const name of c.products) {
    const anywhere = await card(page, name).count();
    const labelled = ((await popular.count()) ? await card(popular, name).count() : 0) + ((await discover.count()) ? await card(discover, name).count() : 0);
    expect(anywhere, `${name} shown outside the labelled sections`).toBe(labelled);
  }

  // Unfollow B from B's store page: B leaves the feed and the count drops.
  await page.goto(`${BUYER_URL}/vendor/${b.id}`);
  await page.getByRole("button", { name: "Unfollow", exact: true }).click();
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toBeVisible();
  await expect.poll(() => followers(b.id)).toBe(0);
  await page.goto(`${BUYER_URL}/home/followings`);
  await expect(section(page, "Your Followings").getByText(a.brand, { exact: true })).toBeVisible();
  await expect(section(page, "Your Followings").getByText(b.brand, { exact: true })).toHaveCount(0);
  for (const name of b.products) await expect(card(section(page, "Following New-In"), name)).toHaveCount(0);
  for (const name of a.products) await expect(card(section(page, "Following New-In"), name).first()).toBeVisible();

  expect(errors).toEqual([]);
  await ctx.close();
});

test("a seller can't follow their own business", async ({ browser }) => {
  test.setTimeout(90_000);
  const me = await sellerWithListings("me");
  const ctx = await contextWithSession(browser, me.session, { width: 1280, height: 1000 });
  const page = await ctx.newPage();

  await page.goto(`${BUYER_URL}/vendor/${me.id}`);
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByText("This is your own business")).toBeVisible();
  expect(followers(me.id)).toBe(0);
  expect(sql(`select count(*) from public.follows where follower_id = '${me.id}'`)).toBe("0");

  // Through the API the database refuses it too.
  const s = stack();
  const api = createClient(s.API, s.ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${me.session.access_token}` } } });
  const { error } = await api.from("follows").insert({ follower_id: me.id, vendor_id: me.id });
  expect(error?.code).toBe("23514");

  // Their own business isn't offered to them as a brand to follow (their listings can still show under
  // "Most Popular", which is the whole catalogue).
  await page.goto(`${BUYER_URL}/home/followings`);
  await expect(page.getByRole("heading", { name: "Your Followings", exact: true })).toBeVisible();
  await expect(section(page, "Looking for New Brands?").getByText(me.brand, { exact: true })).toHaveCount(0);
  await expect(section(page, "Your Followings").getByText(me.brand, { exact: true })).toHaveCount(0);
  await ctx.close();
});
