// Seller Home audit, Medium fixes batch 1 (2026-11-17): what a seller sees, end to end on the local stack.
// Plan: documentation/seller-home-medium-fixes-plan-2026-11-17.md. Rules without a browser:
// scripts/seller-medium-fixes-check.mjs and scripts/notification-kinds-check.mjs.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop()!;
    sql(`delete from public.notifications where profile_id = '${id}';
         delete from public.engagement_events where vendor_id = '${id}';
         delete from public.catalogues where vendor_id = '${id}';
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_premises_photos where vendor_id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function seller(prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  made.push(who.id);
  return who;
}

async function open(browser: Browser, session: Parameters<typeof contextWithSession>[1], path: string, wide = false): Promise<Page> {
  const ctx = await contextWithSession(browser, session, wide ? { width: 1280, height: 1000 } : undefined);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}${path}`);
  return page;
}

// ── SH-034, SH-035: notices go somewhere, tabs that can't fill are hidden ──
test("a listing notice opens the listing's status; an admin-only notice has no action", async ({ browser }) => {
  const who = await seller("md-notice");
  sql(`select public.notify('${who.id}', 'product_rejected', 'Your listing wasn''t approved', 'Blurry photos');
       select public.notify('${who.id}', 'billing_incident', 'A payment needs attention', 'Open Subscriptions in Cosora-Admin to see it.');`);
  const page = await open(browser, who.session, "/notifications");
  await expect(page.getByText("Your listing wasn't approved")).toBeVisible();
  // (A dev build adds sample notices of every kind, so "a tab with nothing in it is hidden" can't be seen here; the
  // production build has none.) The incident is filed under Payments.
  await page.getByRole("button", { name: /^Payments/ }).click();
  await expect(page.getByText("A payment needs attention")).toBeVisible();
  await expect(page.getByText("Your listing wasn't approved")).toHaveCount(0);
  await page.getByRole("button", { name: /^All/ }).click();
  // The admin-only notice has no action button.
  const incident = page.locator("div.group", { hasText: "A payment needs attention" });
  await expect(incident.getByRole("button", { name: /See|Open|View/ })).toHaveCount(0);
  await page.getByRole("button", { name: /See what to change/ }).click();
  await expect(page).toHaveURL(/\/products\?status=rejected$/);
  await expect(page.getByLabel("Filter by status")).toHaveValue("rejected");
});

// ── SH-041, SH-043: only what changed is saved, and it's checked ──
test("the contact sheet saves only the edited field and refuses a bad website", async ({ browser }) => {
  const who = await seller("md-contact");
  sql(`update public.vendor_profiles set phone = '+919876543210', owner_name = 'R Sharma', state = 'Gujarat' where id = '${who.id}';`);
  const page = await open(browser, who.session, "/business-profile?focus=contact-details", true);
  await page.locator("#contact-details").getByRole("button").first().click();
  const sheet = page.getByText("Contact Details").locator("xpath=ancestor::div[contains(@class,'fixed')][1]");
  await expect(sheet.getByRole("button", { name: "No changes" })).toBeDisabled();
  await sheet.getByLabel("Website").fill("x");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Enter your website's address, like yourbusiness.in.")).toBeVisible();
  await sheet.getByLabel("Website").fill("mybiz.in");
  const writes: string[] = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && /vendor_profiles/.test(r.url())) writes.push(r.postData() ?? ""); });
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Contact details updated")).toBeVisible();
  expect(writes.length).toBe(1);
  expect(Object.keys(JSON.parse(writes[0]))).toEqual(["website"]); // the row's id is in the URL
  expect(sql(`select website || '|' || phone || '|' || owner_name from public.vendor_profiles where id = '${who.id}'`))
    .toBe("https://mybiz.in|+919876543210|R Sharma");
});

// ── SH-042: outside India the state is typed ──
test("a seller outside India types a region and saves", async ({ browser }) => {
  const who = await seller("md-abroad");
  sql(`update public.vendor_profiles set country = 'United Kingdom', country_code = 'GB', state = null where id = '${who.id}';`);
  const page = await open(browser, who.session, "/business-profile?focus=contact-details", true);
  await page.locator("#contact-details").getByRole("button").first().click();
  await page.getByLabel("State or region").fill("Greater London");
  await page.getByLabel("Phone number").fill("+44 20 7946 0958");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Contact details updated")).toBeVisible();
  expect(sql(`select state || '|' || phone from public.vendor_profiles where id = '${who.id}'`)).toBe("Greater London|+442079460958");
});

// ── SH-044: social links are checked and shown on the store ──
test("social links: the wrong platform is refused, the right one shows on the store", async ({ browser }) => {
  const who = await seller("md-social");
  const page = await open(browser, who.session, "/add-social-links", true);
  await page.getByLabel("Facebook link").fill("https://instagram.com/mybiz");
  await page.getByRole("button", { name: "Save Social Links" }).click();
  await expect(page.getByText("Enter a link to your Facebook page", { exact: false })).toBeVisible();
  await page.getByLabel("Facebook link").fill("facebook.com/mybiz");
  await page.getByLabel("Instagram link").fill("@mybiz");
  await page.getByRole("button", { name: "Save Social Links" }).click();
  await expect(page.getByText("Social links saved")).toBeVisible();
  expect(sql(`select social::text from public.vendor_profiles where id = '${who.id}'`))
    .toBe('{"facebook": ["https://facebook.com/mybiz"], "instagram": ["https://instagram.com/mybiz"]}');

  const buyer = await freshAccount("md-social-buyer");
  made.push(buyer.id);
  const store = await open(browser, buyer.session, `/vendor/${who.id}`, true);
  const row = store.getByTestId("store-social-links");
  await row.scrollIntoViewIfNeeded().catch(() => undefined);
  await expect(row.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", "https://facebook.com/mybiz");
  await expect(row.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/mybiz");
});

// ── SH-046: a photo waiting for review isn't "Missing" ──
test("premises photos in review show In review on the score page", async ({ browser }) => {
  const who = await seller("md-score");
  sql(`insert into public.vendor_premises_photos (vendor_id, url, status)
       values ('${who.id}', 'http://127.0.0.1:54321/storage/v1/object/public/product-images/${who.id}/premises/a.jpg', 'under_review');`);
  const page = await open(browser, who.session, "/business-profile-score", true);
  const tile = page.getByRole("link", { name: /Business Picture add 5 hd Photos/ });
  await expect(tile).toContainText("In review");
  await expect(tile).not.toContainText("Missing");
  await expect(page.getByRole("link", { name: /Get a listing approved/ })).toBeVisible();
});

// ── SH-054, SH-060: required answers, steps in history, answers kept ──
test("upload: required answers block Continue, Back goes a step back, a refresh keeps the answers", async ({ browser }) => {
  const who = await seller("md-upload");
  const page = await open(browser, who.session, "/upload", true);
  await page.getByRole("button", { name: /Raw Materials/ }).first().click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.getByRole("button", { name: /Knitted Fabrics/ }).first().click();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.locator("#name").fill("Medium knit");
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByTestId("upload-step-problem")).toContainText("Knit Type");
  await expect(page.locator("#name")).toBeVisible(); // still on Details

  await page.goBack();
  await expect(page.getByRole("button", { name: /Knitted Fabrics/ }).first()).toBeVisible(); // Sub-category, still /upload
  expect(new URL(page.url()).pathname).toBe("/upload");
  await page.goForward();
  await expect(page.locator("#name")).toHaveValue("Medium knit");

  await page.reload();
  await expect(page.locator("#name")).toHaveValue("Medium knit");
  await expect(page.getByTestId("upload-draft-restored")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("button", { name: /Raw Materials/ }).first()).toBeVisible();
});

// ── SH-073: the catalogue form is locked at the Free plan's limit ──
test("a Free seller with a catalogue sees the form locked, not a form that discards", async ({ browser }) => {
  const who = await seller("md-cat");
  sql(`insert into public.catalogues (vendor_id, title, file_url, status)
       values ('${who.id}', 'Kept', 'http://127.0.0.1:54321/storage/v1/object/public/catalogues/${who.id}/k.pdf', 'live');`);
  const page = await open(browser, who.session, "/upload-catalogue", true);
  await expect(page.getByTestId("catalogue-form-locked")).toBeVisible();
  await expect(page.getByText("Drag & drop your catalogue")).toHaveCount(0);
});

// ── SH-077: Analytics gets counts, never who; a rare search stays hidden ──
test("seller Analytics: no account ids, and a term two people searched is hidden", async ({ browser }) => {
  const who = await seller("md-eng");
  const buyer = await freshAccount("md-eng-buyer");
  made.push(buyer.id);
  const b2 = await freshAccount("md-eng-b2");
  const b3 = await freshAccount("md-eng-b3");
  made.push(b2.id, b3.id);
  // Three signed-in buyers searched "cotton knit"; "zz rare" by one buyer and three guest sessions. Only signed-in
  // visitors count toward the floor (push security review, 2026-11-17), so "zz rare" stays hidden.
  sql(`insert into public.engagement_events (event_type, vendor_id, viewer_id, source) values ('product_view', '${who.id}', '${buyer.id}', 'direct');
       insert into public.engagement_events (event_type, vendor_id, viewer_id, source, query_text)
         select 'search_impression', '${who.id}', v, 'organic_search', 'cotton knit'
         from unnest(array['${buyer.id}', '${b2.id}', '${b3.id}']::uuid[]) v;
       insert into public.engagement_events (event_type, vendor_id, viewer_id, source, query_text)
         values ('search_impression', '${who.id}', '${buyer.id}', 'organic_search', 'zz rare');
       insert into public.engagement_events (event_type, vendor_id, session_id, source, query_text)
         select 'search_impression', '${who.id}', 'md-s-' || g, 'organic_search', 'zz rare' from generate_series(1, 3) g;`);
  const page = await open(browser, who.session, "/analytics", true);
  const answer = await page.waitForResponse((r) => /rpc\/vendor_engagement_events/.test(r.url()));
  const body = await answer.text();
  expect(body).not.toContain(buyer.id);
  expect(body).toContain("cotton knit");
  expect(body).not.toContain("zz rare");
  // The table itself no longer answers with who viewed.
  const direct = await page.evaluate(async ({ api, id }) => {
    const raw = localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith("-auth-token")) ?? "");
    const token = raw ? JSON.parse(raw).access_token : "";
    const anon = (window as unknown as { __SUPABASE_ANON__?: string }).__SUPABASE_ANON__ ?? "";
    const r = await fetch(`${api}/rest/v1/engagement_events?select=viewer_id&vendor_id=eq.${id}`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon || token },
    });
    return r.status;
  }, { api: "http://127.0.0.1:54321", id: who.id });
  expect(direct).not.toBe(200);
});
