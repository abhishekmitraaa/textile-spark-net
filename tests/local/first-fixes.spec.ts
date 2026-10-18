/**
 * The 2026-10-18 buyer audit's "fix first" list (Mitra: "fix all the first-fix problems"). Local stack only
 * (stack.ts refuses anything else).
 *   - requirement numbers: the first number with its decimals, never every digit run together
 *   - the requirement form's budget: Max is Max, whichever box is typed first
 *   - chat: photos, PDFs and voice notes really upload and reach the other side
 *   - chat: a contact card reveals the number to the other side, and doesn't lock the chat
 *   - chat: block stops both sides, unblock restores; star, archive and delete-for-me are real
 *   - a page file that is gone after a deploy shows "Cosora has been updated", not a white screen
 *   - "Looking for these?" shows real live listings, not "$499" demo cards
 * The database half (guards, grants, the deletion-code cap) is tested in SQL: test.md, 2026-10-18.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, watchErrors } from "./stack";
import { amountFrom, firstNumber, quantityFrom } from "../../src/lib/requirementNumbers";

// A microphone that "hears" a test tone, granted without a prompt: voice notes can be recorded headless.
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

const tag = Date.now().toString(36);
const accounts: string[] = [];

test.afterAll(() => {
  for (const id of accounts) {
    sql(`delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.rfq_submissions where buyer_id = '${id}';
         delete from public.product_images where product_id in (select id from public.products where vendor_id = '${id}');
         delete from public.products where vendor_id = '${id}';
         update auth.users set phone = null where id = '${id}';`);
  }
});

// 1×1 PNG and a tiny PDF.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test("requirement numbers read the first number, with its decimals", () => {
  expect(firstNumber("12.50")).toBe(12.5);
  expect(firstNumber("₹1,00,000 per lot")).toBe(100000);
  expect(firstNumber("500 kg / 2 tons")).toBe(500);
  expect(firstNumber("about a dozen")).toBeNull();
  expect(quantityFrom("1.5 tons")).toBe(2);
  expect(quantityFrom("500 kg / 2 tons")).toBe(500); // was 5002
  expect(quantityFrom("0")).toBeNull();
  expect(quantityFrom("999999999999")).toBeNull(); // past the column's limit: kept in the text only
  expect(amountFrom("12.50")).toBe(12.5); // was 1250
  expect(amountFrom("₹4.605")).toBe(4.61);
});

test("the requirement form saves Max as Max and keeps decimals", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`ffbuy${tag}`);
  accounts.push(buyer.id);
  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 900 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const field = (label: RegExp) =>
    page.locator("div", { has: page.locator(":scope > label", { hasText: label }) }).locator(":scope > input").first();

  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Create New Requirement/ }).click();
  await page.getByRole("button", { name: /Others \(Custom\)/ }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await field(/^What is it\?/).fill(`FF ${tag} costume`);
  await field(/^Quantity/).fill("1.5 tons");
  // Min first, the order most people type in: Max used to come out equal to Min.
  await page.getByPlaceholder("Min").fill("12.50");
  await page.getByPlaceholder("Max").fill("40");
  await page.getByRole("button", { name: /Submit Quote Request/ }).click();
  await expect(page.getByTestId("rfq-sent-for-review")).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => sql(`select quantity || '|' || budget_min::float8 || '|' || budget_max::float8 from public.rfq_submissions where buyer_id = '${buyer.id}'`))
    .toBe("2|12.5|40");

  // Min more than Max is caught before anything is sent.
  await page.goto(`${BUYER_URL}/requirement/post-requirement`);
  await page.getByRole("button", { name: /Create New Requirement/ }).click();
  await page.getByRole("button", { name: /Others \(Custom\)/ }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await field(/^What is it\?/).fill(`FF ${tag} second`);
  await field(/^Quantity/).fill("10");
  await page.getByPlaceholder("Min").fill("90");
  await page.getByPlaceholder("Max").fill("40");
  await page.getByRole("button", { name: /Submit Quote Request/ }).click();
  await expect(page.getByText("The minimum is more than the maximum.")).toBeVisible();
  expect(sql(`select count(*) from public.rfq_submissions where buyer_id = '${buyer.id}'`)).toBe("1");
  expect(errors).toEqual([]);
  await ctx.close();
});

async function openMenuItem(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name }).click();
}

test("chat: files, voice notes, contact cards, block, star, archive and delete are real", async ({ browser }) => {
  test.setTimeout(240_000);
  const buyer = await freshAccount(`ffcb${tag}`);
  const seller = await freshAccount(`ffcs${tag}`, { seller: true });
  accounts.push(buyer.id, seller.id);
  const phone = `9197${String(Date.now()).slice(-8)}`; // unique: auth.users.phone is
  sql(`update auth.users set phone = '${phone}' where id = '${buyer.id}';`);
  const conv = sql(`insert into public.conversations (user_a, user_b)
                    values (least('${buyer.id}'::uuid, '${seller.id}'::uuid), greatest('${buyer.id}'::uuid, '${seller.id}'::uuid))
                    returning id`).split("\n")[0];
  const count = (kind: string) => sql(`select count(*) from public.messages where conversation_id = '${conv}' and kind = '${kind}'`);

  const bctx = await contextWithSession(browser, buyer.session, { width: 390, height: 844 }, true);
  await bctx.grantPermissions(["microphone"]);
  const bp = await bctx.newPage();
  const berrors = watchErrors(bp);
  const sctx = await contextWithSession(browser, seller.session, { width: 390, height: 844 }, true);
  const sp = await sctx.newPage();

  await bp.goto(`${BUYER_URL}/chats/${seller.id}`);
  await expect(bp.getByPlaceholder("Message")).toBeVisible({ timeout: 30_000 });
  await sp.goto(`${BUYER_URL}/chats/${buyer.id}`);
  await expect(sp.getByPlaceholder("Message")).toBeVisible({ timeout: 30_000 });

  // ── A photo: uploaded, and the seller sees it (it used to be an empty bubble).
  await bp.locator('input[type=file][accept^="image/jpeg"]').setInputFiles({ name: "swatch.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(() => count("image"), { timeout: 30_000 }).toBe("1");
  expect(sql(`select attachment_mime || '|' || (attachment_bytes > 0) from public.messages where conversation_id = '${conv}' and kind = 'image'`))
    .toMatch(/^image\/(webp|jpeg|png)\|true$/);
  const photo = sp.getByRole("img", { name: "Photo" });
  await expect(photo).toBeVisible({ timeout: 20_000 });
  expect(await photo.getAttribute("src")).toContain("/storage/v1/object/sign/chat-attachments/");

  // ── A PDF: the seller sees its name and can open it.
  await bp.locator('input[type=file][accept^="application/pdf"]').setInputFiles({ name: "size-chart.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect.poll(() => count("file"), { timeout: 30_000 }).toBe("1");
  const pdf = sp.getByRole("link", { name: /size-chart\.pdf/ });
  await expect(pdf).toBeVisible({ timeout: 20_000 });
  await expect(pdf).toHaveAttribute("href", /chat-attachments/);

  // ── A voice note: recorded, sent, and playable on the other side.
  await bp.getByRole("button", { name: "Record a voice note" }).click();
  await expect(bp.getByRole("button", { name: "Send voice note" })).toBeVisible();
  await bp.waitForTimeout(1500);
  await bp.getByRole("button", { name: "Send voice note" }).click();
  await expect.poll(() => count("audio"), { timeout: 30_000 }).toBe("1");
  expect(sql(`select attachment_mime like 'audio/%' and attachment_seconds >= 1 from public.messages where conversation_id = '${conv}' and kind = 'audio'`)).toBe("t");
  await expect(sp.locator("audio")).toHaveCount(1, { timeout: 20_000 });

  // ── A contact card: no number in the message, the chat isn't locked, the seller reveals the number.
  await bp.getByRole("button", { name: "Attach", exact: true }).click();
  await bp.getByRole("button", { name: "Contact", exact: true }).click();
  await expect.poll(() => count("contact"), { timeout: 20_000 }).toBe("1");
  expect(sql(`select body from public.messages where conversation_id = '${conv}' and kind = 'contact'`)).not.toMatch(/\d{6}/);
  expect(sql(`select status from public.conversations where id = '${conv}'`)).toBe("active");
  await sp.getByRole("button", { name: "Show number" }).click();
  await expect(sp.getByRole("link", { name: `+${phone}` })).toBeVisible();

  // ── Block: the buyer blocks; the seller can't send; unblock restores it.
  await openMenuItem(bp, "Block seller");
  await expect(bp.getByText(/You blocked .+ Neither of you can message, call or send quotes to the other\./)).toBeVisible();
  await expect(bp.getByPlaceholder("Messages are blocked in this chat")).toBeDisabled();
  const before = count("text");
  await sp.getByPlaceholder("Message").fill(`FF ${tag} still there?`);
  await sp.getByRole("button", { name: "Send" }).click();
  await expect(sp.getByText("One of you has blocked the other.")).toBeVisible();
  expect(count("text")).toBe(before);
  await bp.getByRole("button", { name: "Unblock" }).click();
  await expect(bp.getByPlaceholder("Message")).toBeEnabled();
  await sp.reload();
  await sp.getByPlaceholder("Message").fill(`FF ${tag} back again`);
  await sp.getByRole("button", { name: "Send" }).click();
  await expect(bp.getByText(`FF ${tag} back again`)).toBeVisible({ timeout: 20_000 });

  // ── Mark as read.
  await openMenuItem(bp, "Mark as Read");
  await expect(bp.getByText("Marked as read")).toBeVisible();

  // ── Star: the row shows it, and Starred lists it.
  await openMenuItem(bp, "Star chat");
  await expect(bp.getByText("Chat starred")).toBeVisible();
  await bp.goto(`${BUYER_URL}/chats`);
  const row = bp.locator("div[role=button]").filter({ hasText: `FF ${tag} back again` }).first();
  await expect(row.getByLabel("Starred")).toBeVisible();
  await bp.getByRole("tab", { name: /Starred/ }).click();
  await expect(row).toBeVisible();

  // ── Archive: out of All, into Archived; unarchive brings it back.
  await bp.goto(`${BUYER_URL}/chats/${seller.id}`);
  await openMenuItem(bp, "Archive chat");
  await expect(bp.getByText("Chat archived")).toBeVisible();
  await bp.goto(`${BUYER_URL}/chats`);
  await expect(bp.getByRole("tab", { name: /All/ })).toBeVisible();
  await expect(row).toHaveCount(0);
  await bp.getByRole("tab", { name: /Archived/ }).click();
  await expect(row).toBeVisible();
  await row.click();
  await openMenuItem(bp, "Unarchive chat");
  await expect(bp.getByText("Chat moved back to your chats")).toBeVisible();

  // ── Delete for me: gone from the list; a new message brings it back with only what came after.
  await openMenuItem(bp, "Delete chat");
  await bp.getByRole("button", { name: "Delete chat" }).last().click();
  await expect(bp).toHaveURL(/\/chats$/);
  await expect(bp.locator("div[role=button]").filter({ hasText: `FF ${tag}` })).toHaveCount(0);
  expect(Number(sql(`select count(*) from public.messages where conversation_id = '${conv}'`))).toBeGreaterThan(4); // nothing removed for the seller
  sql(`insert into public.messages (conversation_id, sender_id, body) values ('${conv}', '${seller.id}', 'FF ${tag} after delete');`);
  await bp.reload();
  await expect(bp.locator("div[role=button]").filter({ hasText: `FF ${tag} after delete` }).first()).toBeVisible({ timeout: 20_000 });
  await bp.goto(`${BUYER_URL}/chats/${seller.id}`);
  await expect(bp.getByText(`FF ${tag} after delete`)).toBeVisible({ timeout: 20_000 });
  await expect(bp.getByText(`FF ${tag} back again`)).toHaveCount(0);
  await expect(bp.getByRole("img", { name: "Photo" })).toHaveCount(0);

  expect(berrors).toEqual([]);
  await bctx.close();
  await sctx.close();
});

test("a page file that a deploy removed shows 'Cosora has been updated', not a white screen", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // The lazily loaded Video Close-Ups page can't be fetched, as after a deploy replaced it.
  await page.route(/VideoCloseUpsPage/, (r) => r.abort());
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(page.getByRole("heading", { name: "WHAT'S ON YOUR MIND" })).toBeVisible({ timeout: 30_000 });
  // Navigate inside the app, as a tap would.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/video-closeups");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  // It reloads once to fetch the new files; the file is still missing, so it says so.
  await expect(page.getByRole("heading", { name: "Cosora has been updated" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await ctx.close();
});

test("'Looking for these?' shows real live listings", async ({ browser }) => {
  test.setTimeout(90_000);
  const seller = await freshAccount(`fflf${tag}`, { seller: true });
  accounts.push(seller.id);
  const product = sql(`insert into public.products (vendor_id, name, status, price_value, moq)
                       values ('${seller.id}', 'FF ${tag} linen shirt', 'live', 349.5, '50') returning id`).split("\n")[0];
  sql(`insert into public.product_images (product_id, url, position)
       values ('${product}', 'http://127.0.0.1:54321/storage/v1/object/public/product-images/${seller.id}/ff.jpg', 0);`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  const heading = page.getByRole("heading", { name: "Looking for these?" });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const section = heading.locator("xpath=following-sibling::div[1]");
  await expect(section.locator(`a[href="/product/${product}"]`).first()).toBeAttached();
  await expect(page.getByText("$499")).toHaveCount(0);
  await expect(page.locator('a[href^="/product/lft"]')).toHaveCount(0);
  await ctx.close();
});
