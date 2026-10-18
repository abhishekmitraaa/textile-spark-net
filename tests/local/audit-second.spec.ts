/**
 * The rest of the 2026-10-18 buyer audit (Mitra, 2026-10-19: "plan and fix the bugs listed above"). Local stack
 * only (stack.ts refuses anything else).
 *   - the phone field takes each listed country's own number length
 *   - sign-up: choosing a role no longer finishes onboarding; accepting the Terms does. Account Info checks the email
 *   - signed out, My Saves is empty (no invented saved products or folders)
 *   - a chat opens on its newest messages and loads older ones on request or on scrolling up
 *   - accepting a quote the seller changed meanwhile is refused and the new terms are shown
 *   - an open requirement shows its deadline; past it, the buyer extends it by 7 days
 *   - sellers see every picture a buyer added to a requirement, and when it closes
 *   - New Arrivals' brand tiles come from top_vendors(), not every seller and listing
 *   - Following's Report opens the real report form about that seller
 * The database half (search limits, analytics limit, deadline rules, grants) is tested in SQL: test.md, 2026-10-19.
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const accounts: string[] = [];

test.afterAll(() => {
  for (const id of accounts) {
    sql(`delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.quotes where vendor_id = '${id}' or rfq_id in (select id from public.rfqs where buyer_id = '${id}');
         delete from public.rfqs where buyer_id = '${id}';
         delete from public.follows where follower_id = '${id}' or vendor_id = '${id}';`);
  }
});

test("the phone field takes each country's number length", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/auth/login`);
  const phone = page.getByPlaceholder("Phone Number");
  const send = page.getByRole("button", { name: "Send Code" });
  const pick = async (country: string) => {
    await page.getByRole("button", { name: /\+\d+/ }).first().click();
    await page.getByRole("button", { name: new RegExp(`^.*${country}`) }).click();
  };

  await phone.fill("98765432101");
  await expect(phone).toHaveValue("9876543210"); // India: 10
  await expect(send).toBeEnabled();

  await pick("Hong Kong");
  await expect(phone).toHaveValue("98765432"); // cut to 8 when the country changes
  await expect(send).toBeEnabled();
  await phone.fill("912345678");
  await expect(phone).toHaveValue("91234567");

  await pick("China");
  await phone.fill("13812345678");
  await expect(phone).toHaveValue("13812345678"); // 11, not cut to a different number
  await expect(send).toBeEnabled();
  await phone.fill("1381234567");
  await expect(send).toBeDisabled();

  await pick("Australia");
  await phone.fill("412345678");
  await expect(phone).toHaveValue("412345678");
  await expect(send).toBeEnabled();
  await ctx.close();
});

test("sign-up is finished at the Terms, not at the role; Account Info checks the email", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`asob${tag}`);
  accounts.push(buyer.id);
  sql(`update public.profiles set onboarded = false where id = '${buyer.id}';`);
  const onboarded = () => sql(`select onboarded from public.profiles where id = '${buyer.id}'`).trim();

  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/auth/role-selection`);
  await page.getByText("BUYER", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/sub-role/);
  expect(onboarded()).toBe("f"); // was set true here, at step 2 of 7

  await page.goto(`${BUYER_URL}/auth/account-info`);
  await page.getByPlaceholder("Enter your name").fill("  Asha  ");
  const mail = page.getByPlaceholder("Please enter a valid email address.");
  await mail.fill("asha@nowhere");
  await mail.blur();
  await expect(page.getByText("Enter a valid email address, like name@company.com.")).toBeVisible();
  await page.getByPlaceholder("Your company or brand name").fill("Asha Exports");
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page).toHaveURL(/\/auth\/account-info/); // not saved
  await mail.fill(`asha.${tag}@example.com`);
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page).toHaveURL(/\/auth\/interest-preference/, { timeout: 15_000 });
  expect(sql(`select full_name from public.profiles where id = '${buyer.id}'`).trim()).toBe("Asha"); // trimmed
  expect(onboarded()).toBe("f");

  await page.goto(`${BUYER_URL}/auth/terms`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "NEXT" }).click();
  await expect(page).toHaveURL(/\/auth\/welcome|\/home\//, { timeout: 15_000 });
  expect(onboarded()).toBe("t");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("signed out, My Saves is empty: no invented saves, and an old seed in the browser is dropped", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // What a visitor's browser kept from the old seed: two invented products in "Summer Collection".
  await ctx.addInitScript(() => localStorage.setItem("cosora.saved.v1", JSON.stringify({
    products: { sp1: { id: "sp1", name: "Premium Cotton Polo T-Shirt" }, sp5: { id: "sp5", name: "Linen Casual Shirt - Sky Blue" } },
    folders: [{ id: "all-saves", name: "All Saves", productIds: ["sp1", "sp5"] }, { id: "summer", name: "Summer Collection", productIds: ["sp1", "sp5"] }],
  })));
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/saved`);
  await expect(page.getByText("All Saves").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Summer Collection")).toHaveCount(0);
  await expect(page.getByText("Formal Attire")).toHaveCount(0);
  await expect(page.getByText("Premium Cotton Polo T-Shirt")).toHaveCount(0);
  await ctx.close();
});

test("a chat opens on its newest 40 messages and loads older ones", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`ascb${tag}`);
  const seller = await freshAccount(`ascs${tag}`, { seller: true });
  accounts.push(buyer.id, seller.id);
  const conv = sql(`insert into public.conversations (user_a, user_b)
                    values (least('${buyer.id}'::uuid, '${seller.id}'::uuid), greatest('${buyer.id}'::uuid, '${seller.id}'::uuid))
                    returning id`).split("\n")[0];
  sql(`insert into public.messages (conversation_id, sender_id, body, created_at)
       select '${conv}', case when g % 2 = 0 then '${buyer.id}'::uuid else '${seller.id}'::uuid end,
              'AS line ' || g, now() - interval '1 day' + make_interval(secs => g)
         from generate_series(1, 95) g;`);

  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const requests: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/rest/v1/messages")) requests.push(r.url()); });
  await page.goto(`${BUYER_URL}/chats/${seller.id}`);
  await expect(page.getByText("AS line 95", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("AS line 56", { exact: true })).toBeAttached();
  await expect(page.getByText("AS line 55", { exact: true })).toHaveCount(0);
  expect(requests.some((u) => u.includes("limit=41"))).toBe(true);

  // Scrolling to the top loads the page before; the reading position stays on what was on screen.
  const box = page.locator("div.overflow-y-auto", { has: page.getByText("AS line 95", { exact: true }) }).first();
  await box.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  await expect(page.getByText("AS line 16", { exact: true })).toBeAttached({ timeout: 15_000 });
  await expect(page.getByText("AS line 15", { exact: true })).toHaveCount(0);
  expect(await box.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);

  // The button does the same; at the start of the chat it goes away.
  await page.getByTestId("chat-load-older").click();
  await expect(page.getByText("AS line 1", { exact: true })).toBeAttached({ timeout: 15_000 });
  await expect(page.getByTestId("chat-load-older")).toHaveCount(0);
  await expect(page.getByText(/^AS line \d+$/)).toHaveCount(95); // each once

  // A new message still arrives live and shows at the bottom.
  sql(`insert into public.messages (conversation_id, sender_id, body) values ('${conv}', '${seller.id}', 'AS live one');`);
  await expect(page.getByText("AS live one")).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});

test("a changed quote isn't accepted at the old terms; the deadline shows and extends", async ({ browser }) => {
  test.setTimeout(150_000);
  const buyer = await freshAccount(`asqb${tag}`);
  const seller = await freshAccount(`asqs${tag}`, { seller: true });
  accounts.push(buyer.id, seller.id);
  const rfq = sql(`insert into public.rfqs (buyer_id, title, status, quantity, budget_min, budget_max)
                   values ('${buyer.id}', 'AS ${tag} cotton tees', 'active', 500, 90, 120) returning id`).split("\n")[0];
  const quote = sql(`insert into public.quotes (rfq_id, vendor_id, price_per_unit, moq, lead_time)
                     values ('${rfq}', '${seller.id}', 100.50, 200, '20 days') returning id`).split("\n")[0];
  const status = () => sql(`select status from public.quotes where id = '${quote}'`).trim();

  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/requirement/my-quotes`);
  await page.getByText(`AS ${tag} cotton tees`).click();
  await expect(page.getByTestId("rfq-deadline")).toContainText("Taking quotes until", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Extend 7 days" })).toHaveCount(0); // 7 days left
  await expect(page.getByText("₹100.50").first()).toBeVisible(); // paise kept

  // The seller raises the price while the buyer has the old one on screen.
  sql(`update public.quotes set price_per_unit = 150 where id = '${quote}';`);
  await page.getByRole("button", { name: /^Accept/ }).first().click();
  await expect(page.getByText("This quote has changed")).toBeVisible({ timeout: 15_000 });
  expect(status()).toBe("pending");
  await expect(page.getByText("₹150").first()).toBeVisible({ timeout: 15_000 }); // the new terms are shown
  await page.getByRole("button", { name: /^Accept/ }).first().click();
  await expect.poll(status, { timeout: 15_000 }).toBe("accepted");

  // Past the deadline: said, and extendable by 7 days.
  sql(`update public.rfqs set expires_at = now() - interval '1 hour' where id = '${rfq}';`);
  await page.reload();
  await page.getByText(`AS ${tag} cotton tees`).click();
  await expect(page.getByTestId("rfq-deadline")).toContainText("Deadline passed on");
  await page.getByRole("button", { name: "Extend 7 days" }).click();
  await expect(page.getByText("Deadline extended")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("rfq-deadline")).toContainText("Taking quotes until");
  expect(sql(`select expires_at > now() + interval '6 days' from public.rfqs where id = '${rfq}'`).trim()).toBe("t");
  expect(errors).toEqual([]);
  await ctx.close();
});

test("sellers see every picture on a requirement and when it closes; an expired one leaves their leads", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`aslb${tag}`);
  const seller = await freshAccount(`asls${tag}`, { seller: true });
  accounts.push(buyer.id, seller.id);
  const base = `${stack().API}/storage/v1/object/public/product-images/${buyer.id}/rfq`;
  const pics = [1, 2, 3].map((i) => `${base}/${tag}-${i}/i.webp`);
  const rfq = sql(`insert into public.rfqs (buyer_id, title, status, image, images)
                   values ('${buyer.id}', 'AS ${tag} linen shirts', 'active', '${pics[0]}', array['${pics.join("','")}'])
                   returning id`).split("\n")[0];

  const ctx = await contextWithSession(browser, seller.session, { width: 1280, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/leads`);
  const card = page.locator("div.rounded-xl", { has: page.getByText(`AS ${tag} linen shirts`) }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId("lead-photos").locator("img")).toHaveCount(3);
  await expect(card).toContainText("Closes");

  sql(`update public.rfqs set expires_at = now() - interval '1 minute' where id = '${rfq}';`);
  await page.reload();
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await expect(page.getByText(`AS ${tag} linen shirts`)).toHaveCount(0);
  await ctx.close();
});

test("New Arrivals' brand tiles come from top_vendors()", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const vendorReads: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/rest/v1/vendor_profiles") && u.includes("brand_name=not.is.null")) vendorReads.push(u);
  });
  const rpc = page.waitForResponse((r) => r.url().includes("/rest/v1/rpc/top_vendors") && r.ok(), { timeout: 30_000 });
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  const res = await rpc;
  expect(JSON.parse(res.request().postData() ?? "{}")).toEqual({ p_limit: 4 });
  await page.waitForTimeout(1500);
  expect(vendorReads).toEqual([]); // the old every-seller read is gone
  await ctx.close();
});

test("Following's Report opens the report form about that seller", async ({ browser }) => {
  const buyer = await freshAccount(`asfb${tag}`);
  const seller = await freshAccount(`asfs${tag}`, { seller: true });
  accounts.push(buyer.id, seller.id);
  sql(`insert into public.follows (follower_id, vendor_id) values ('${buyer.id}', '${seller.id}');`);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/home/followings/view-all`);
  await expect(page.getByText(`asfs${tag} Textiles`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "More options" }).first().click();
  await page.getByRole("menuitem", { name: "Report" }).click();
  await expect(page).toHaveURL(new RegExp(`/report-fraud\\?entity_type=vendor&entity_id=${seller.id}`));
  await ctx.close();
});
