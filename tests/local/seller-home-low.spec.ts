// Seller Home audit, Low items batch 1 (2026-11-17): end to end on the local stack.
// Plan and record: documentation/seller-home-low-fixes-plan-2026-11-17.md. Database: 20261117130000, 20261117130100.

import { spawn } from "node:child_process";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, service, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const made: string[] = [];

test.afterEach(async () => {
  while (made.length) {
    const id = made.pop()!;
    // Storage objects go through the Storage API (a direct delete is refused).
    const files = sql(`select name from storage.objects where bucket_id = 'product-images' and name like '${id}/%'`)
      .split("\n").map((l) => l.trim()).filter(Boolean);
    if (files.length) await service().storage.from("product-images").remove(files);
    sql(`delete from public.quotes where vendor_id = '${id}';
         delete from public.rfqs where buyer_id = '${id}';
         delete from public.notifications where profile_id = '${id}';
         delete from public.product_documents where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.products where vendor_id = '${id}';
         delete from public.vendor_profiles where id = '${id}';
         delete from public.profiles where id = '${id}';
         delete from auth.users where id = '${id}';`);
  }
});

async function account(prefix: string, seller = true) {
  const who = await freshAccount(`${prefix}${tag}`, { seller });
  made.push(who.id);
  return who;
}

function clientFor(session: Session): SupabaseClient {
  const s = stack();
  return createClient(s.API, s.ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

const firstId = (out: string) => out.split("\n").map((l) => l.trim()).find((l) => /^[0-9a-f-]{36}$/.test(l))!;
const category = (name = "Accessories") => sql(`select id from public.categories where name = '${name}' limit 1`).trim();

/** A listing. `extra` is "col1, col2=value1, value2" (the columns, then their values). category_name follows category_id. */
function listing(vendor: string, name: string, extra = "", status = "live", categoryName = "Accessories"): string {
  return firstId(sql(`insert into public.products (vendor_id, name, status, price_value, moq, category_id${extra ? ", " + extra.split("=")[0] : ""})
    values ('${vendor}', '${name}', '${status}', 450.75, '10', '${category(categoryName)}'${extra ? ", " + extra.split("=").slice(1).join("=") : ""})
    returning id`));
}

async function page(browser: Browser, session: Session, path: string, viewport = { width: 1280, height: 1000 }): Promise<Page> {
  const ctx = await contextWithSession(browser, session, viewport);
  const p = await ctx.newPage();
  await p.goto(`${BUYER_URL}${path}`);
  return p;
}

// ── SH-037, SH-038, SH-039, SH-040: notifications ──
test("notifications: every unread one counts, older ones are reachable, signed out says so, buyer text stays as written", async ({ browser }) => {
  const s = await account("lownote");
  sql(`insert into public.notifications (profile_id, kind, title, body, created_at)
       select '${s.id}', 'subscription_changed', 'Your plan has changed', 'Note ' || g, now() - (g || ' minutes')::interval
         from generate_series(1, 104) g;
       insert into public.notifications (profile_id, kind, title, body)
       values ('${s.id}', 'lead_match', 'New requirement: Cotton kurta ${tag}', 'Open your leads to send a quote.');`);
  const p = await page(browser, s.session, "/notifications");
  // The bell counts all 105, not the newest 100.
  await expect(p.getByRole("button", { name: "Notifications, 105 unread" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText("Note 104")).toHaveCount(0);
  await p.getByRole("button", { name: "Show older notifications" }).click();
  await expect(p.getByText("Note 104")).toBeVisible();
  // The buyer's words aren't translated; Cosora's are.
  await expect(p.locator("h3 span[data-no-translate]", { hasText: `Cotton kurta ${tag}` })).toHaveCount(1);

  // SH-040: a browser changes only `read`.
  const db = clientFor(s.session);
  const row = sql(`select id from public.notifications where profile_id = '${s.id}' and kind = 'lead_match'`).trim();
  expect((await db.from("notifications").update({ title: "Hacked" }).eq("id", row)).error?.code).toBe("42501");
  expect((await db.from("notifications").update({ read: true }).eq("id", row)).error).toBeNull();
  await p.context().close();

  // SH-038: signed out.
  const ctx = await browser.newContext();
  const out = await ctx.newPage();
  await out.goto(`${BUYER_URL}/notifications`);
  await expect(out.getByTestId("notifications-signed-out")).toContainText("Sign in to see your notifications");
  await ctx.close();
});

// ── SH-047, SH-048, SH-051: the score ──
test("the score: an API edit rescores, odd input scores the same in the page and the database, others can't read it", async ({ browser }) => {
  const s = await account("lowscore");
  const db = clientFor(s.session);
  const live = listing(s.id, `LS ${tag} live`);
  const before = Number(sql(`select profile_score from public.vendor_profiles where id = '${s.id}'`));
  // SH-047: an edit that doesn't name status sends the listing to review, and the "a live listing" points go.
  expect((await db.from("products").update({ description: "Edited by the API" }).eq("id", live)).error).toBeNull();
  expect(sql(`select status from public.products where id = '${live}'`)).toBe("under_review");
  expect(Number(sql(`select profile_score from public.vendor_profiles where id = '${s.id}'`))).toBe(before - 7);

  // SH-048: eleven emoji count as eleven characters in both; a no-break-space website counts in both.
  sql(`update public.vendor_profiles set about = repeat('🧵', 11), website = E'\\u00a0' where id = '${s.id}'`);
  const stored = Number(sql(`select profile_score from public.vendor_profiles where id = '${s.id}'`));
  const p = await page(browser, s.session, "/business-profile-score");
  await expect(p.getByText(`${stored}%`).first()).toBeVisible({ timeout: 20_000 });

  // SH-051: the column is the seller's own through my_profile_score(); nobody reads it off the table.
  expect((await db.rpc("my_profile_score")).data).toBe(stored);
  expect((await db.from("vendor_profiles").select("profile_score").eq("id", s.id)).error?.code).toBe("42501");
  const anon = createClient(stack().API, stack().ANON, { auth: { persistSession: false } });
  expect((await anon.from("vendor_profiles").select("profile_score").limit(1)).error?.code).toBe("42501");
  expect((await anon.from("vendor_profiles").select("brand_name").limit(1)).error).toBeNull();

  // SH-052: opened directly, Back goes to Seller Home instead of leaving the app.
  await p.getByRole("button", { name: "Back" }).click();
  await expect(p).toHaveURL(/\/seller-home$/);
  await p.context().close();
});

// ── SH-049, SH-050, SH-053: Business profile ──
test("business profile: the capacity link opens the bands, About says how long it must be, sheets are dialogs", async ({ browser }) => {
  const s = await account("lowbp");
  const p = await page(browser, s.session, "/business-profile?focus=capacity");
  await expect(p.locator("#capacity")).toBeInViewport({ timeout: 20_000 });
  await expect(p.locator("#capacity")).toContainText("Capacity");

  // SH-053: the employees sheet is a dialog with a labelled back button; Escape closes it.
  await p.getByRole("button", { name: "Add employee count" }).click();
  const dialog = p.getByRole("dialog", { name: "Number of Employees" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // SH-050: About Us counts from 11 characters, and says so.
  await p.locator("#about-us").getByRole("button").first().click();
  const about = p.getByRole("dialog", { name: "About Us" });
  await about.locator("textarea").fill("We knit.");
  await expect(about.getByTestId("about-count")).toHaveText("8 of 11 characters to count toward your profile score.");
  await about.locator("textarea").fill("We knit cotton tees.");
  await expect(about.getByTestId("about-count")).toHaveText("Counts toward your profile score.");
  await p.context().close();
});

// ── SH-064, SH-065, SH-066, SH-067: Products ──
test("products: paise and one unit, the category filter works, Duplicate copies the whole listing and its photos", async ({ browser }) => {
  const s = await account("lowprod");
  const src = listing(s.id, `LP ${tag} source`,
    `sizes, attributes, unit, customization_available=array['S','M'], '{"sku":"LP-1"}'::jsonb, 'pieces', true`);
  listing(s.id, `LP ${tag} other`, "", "live", "Activewear");
  // A photo in the seller's own folder, uploaded as the seller.
  const db = clientFor(s.session);
  const path = `${s.id}/${src}/photo.jpg`;
  const up = await db.storage.from("product-images").upload(path, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });
  expect(up.error).toBeNull();
  const url = db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  sql(`insert into public.product_images (product_id, url, position) values ('${src}', '${url}', 0)`);

  const p = await page(browser, s.session, "/products");
  const errors = watchErrors(p);
  // The desktop row (the phone card's copy is hidden at this width).
  await expect(p.locator("p:visible", { hasText: /^₹450\.75$/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(p.locator("p:visible", { hasText: /^per piece$/ }).first()).toBeVisible();
  // SH-065: the seller's own categories, and the filter applies.
  await p.locator("select[aria-label='Filter by category']:visible").selectOption("Activewear");
  await expect(p.getByText(`LP ${tag} other`).filter({ visible: true }).first()).toBeVisible();
  await expect(p.getByText(`LP ${tag} source`).filter({ visible: true })).toHaveCount(0);
  await p.locator("select[aria-label='Filter by category']:visible").selectOption("all");

  // SH-066: Duplicate.
  // Rows are newest first: "other", then "source".
  await p.getByRole("button", { name: "More actions" }).filter({ visible: true }).nth(1).click();
  await p.getByRole("button", { name: "Duplicate" }).filter({ visible: true }).first().click();
  const outcome = p.getByText(/Product duplicated|Duplicate failed/).first();
  await expect(outcome).toBeVisible();
  expect(await p.locator("[data-sonner-toast]").first().innerText()).toContain("Product duplicated");
  await expect.poll(() => sql(`select count(*) from public.products where vendor_id = '${s.id}' and name = 'LP ${tag} source (Copy)'`)).toBe("1");
  const copy = sql(`select id from public.products where name = 'LP ${tag} source (Copy)'`).trim();
  expect(sql(`select status || '|' || array_to_string(sizes, ',') || '|' || (attributes ->> 'sku') || '|' || unit || '|' || customization_available
                from public.products where id = '${copy}'`)).toBe("draft|S,M|LP-1|pieces|true");
  const copiedUrl = sql(`select url from public.product_images where product_id = '${copy}'`).trim();
  expect(copiedUrl).toContain(`/product-images/${s.id}/${copy}/`);
  expect(copiedUrl).not.toBe(url);
  expect(errors).toEqual([]);
  await p.context().close();
});

test("the 3-PDF limit holds when two uploads overlap", async () => {
  const s = await account("lowpdf");
  const prod = listing(s.id, `LD ${tag}`);
  sql(`insert into public.product_documents (product_id, path, name, size_bytes, position)
       select '${prod}', '${s.id}/${prod}/' || gen_random_uuid() || '.pdf', 'd' || g, 10, g from generate_series(1, 2) g`);
  const run = (q: string) => new Promise<{ code: number; out: string }>((resolve) => {
    const ps = spawn("docker", ["exec", "-i", "supabase_db_localstack", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    ps.stdout.on("data", (d) => { out += d; });
    ps.stderr.on("data", (d) => { out += d; });
    ps.on("close", (code) => resolve({ code: code ?? 1, out }));
    ps.stdin.end(q);
  });
  const ins = (n: number) => `insert into public.product_documents (product_id, path, name, size_bytes, position)
                              values ('${prod}', '${s.id}/${prod}/' || gen_random_uuid() || '.pdf', 'x${n}', 10, ${n});`;
  // A holds its transaction open after inserting the third; B starts meanwhile and must wait, then be refused.
  const a = run(`begin; ${ins(3)} select pg_sleep(2); commit;`);
  await new Promise((r) => setTimeout(r, 700));
  const b = run(`begin; ${ins(4)} commit;`);
  const [ra, rb] = await Promise.all([a, b]);
  expect(ra.code).toBe(0);
  expect(rb.code).not.toBe(0);
  expect(rb.out).toContain("at most 3 PDFs");
  expect(sql(`select count(*) from public.product_documents where product_id = '${prod}'`)).toBe("3");
});

// ── SH-069, SH-070, SH-074: videos and catalogues ──
test("videos and catalogues: no invented figures, delete asks first, Back stays in the app", async ({ browser }) => {
  const s = await account("lowmedia");
  const cat = firstId(sql(`insert into public.catalogues (vendor_id, title, file_url, status)
      values ('${s.id}', 'LM ${tag} catalogue', 'https://example.invalid/x.pdf', 'live') returning id`));
  const p = await page(browser, s.session, "/upload-catalogue");
  await expect(p.getByText(`LM ${tag} catalogue`)).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText(/3× more/)).toHaveCount(0);
  await expect(p.getByText(/0 views|downloads/)).toHaveCount(0);
  await p.locator("div", { hasText: `LM ${tag} catalogue` }).getByRole("button").filter({ has: p.locator("svg.lucide-trash2, svg.lucide-trash-2") }).last().click();
  const confirm = p.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete this catalogue?");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  expect(sql(`select count(*) from public.catalogues where id = '${cat}'`)).toBe("1");
  await p.getByRole("button").first().click(); // the back arrow, opened directly
  await expect(p).toHaveURL(/\/seller-home$/);

  await p.goto(`${BUYER_URL}/upload-video`);
  await expect(p.getByText("Show your product in motion")).toBeVisible({ timeout: 20_000 });
  await expect(p.getByText(/5× more/)).toHaveCount(0);
  sql(`delete from public.catalogues where id = '${cat}'`);
  await p.context().close();
});

// ── SH-081, SH-082: quotes ──
test("quotes: a price must be above 0, and View quote opens the quote and its request", async ({ browser }) => {
  const s = await account("lowquote");
  const buyer = await account("lowqbuyer", false);
  const rfq = firstId(sql(`insert into public.rfqs (buyer_id, title, quantity, status, expires_at)
       values ('${buyer.id}', 'LQ ${tag} kurtas', 250, 'active', now() + interval '7 days') returning id`));
  const db = clientFor(s.session);
  expect((await db.from("quotes").insert({ rfq_id: rfq, vendor_id: s.id, price_per_unit: -5 })).error?.message).toMatch(/quotes_price_positive/);
  expect((await db.from("quotes").insert({ rfq_id: rfq, vendor_id: s.id, price_per_unit: 450.75, moq: 0 })).error?.message).toMatch(/quotes_moq_positive/);
  expect((await db.from("quotes").insert({ rfq_id: rfq, vendor_id: s.id, price_per_unit: 450.75, moq: 50, lead_time: "14 days", comment: "Cotton, two colours" })).error).toBeNull();

  const p = await page(browser, s.session, "/quotes");
  await p.getByRole("button", { name: /View quote/ }).first().click();
  const dialog = p.getByTestId("quote-detail");
  await expect(dialog).toContainText("₹450.75");
  await expect(dialog).toContainText("50 pcs");
  await expect(dialog).toContainText("Cotton, two colours");
  await expect(dialog).toContainText(`LQ ${tag} kurtas`);
  await expect(dialog).toContainText("250 pcs");
  await p.context().close();
});
