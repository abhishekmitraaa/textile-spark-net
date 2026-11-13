/**
 * /kyc on the local stack: replacing a rejected document never leaves a saved row pointing at a deleted file
 * (onboarding audit #31). The new file goes only when the database refused the new row.
 */
import { expect, test, type Page } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql } from "./stack";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const scan = { name: "pan-new.png", mimeType: "image/png", buffer: PNG };

/** A seller whose PAN was rejected, on /kyc. */
async function rejectedPan(browser: import("@playwright/test").Browser, prefix: string) {
  const who = await freshAccount(prefix, { seller: true });
  // The review guard blanks review fields on every insert but an admin's: skip triggers for the setup row.
  sql(`set session_replication_role = replica;
       insert into public.vendor_documents (vendor_id, doc_type, file_url, verified, rejection_reason, reviewed_at)
       values ('${who.id}', 'pan', '${who.id}/kyc/old-pan.png', false, 'The scan is blurred', now());`);
  const ctx = await contextWithSession(browser, who.session);
  const page = await ctx.newPage();
  await page.goto(`${BUYER_URL}/kyc`);
  await expect(page.getByText("The scan is blurred")).toBeVisible({ timeout: 15_000 });
  return { who, ctx, page };
}

const newPanFiles = (id: string) =>
  sql(`select count(*) from storage.objects where bucket_id = 'business-docs' and name like '${id}/kyc/%' and name <> '${id}/kyc/old-pan.png';`);
const panRows = (id: string) =>
  sql(`select string_agg(coalesce(rejection_reason, 'new'), ',' order by created_at) from public.vendor_documents where vendor_id = '${id}' and doc_type = 'pan';`);
/** The new row's file is in Storage. */
const newRowHasFile = (id: string) =>
  sql(`select count(*) from public.vendor_documents d join storage.objects o on o.bucket_id = 'business-docs' and o.name = d.file_url
       where d.vendor_id = '${id}' and d.doc_type = 'pan' and d.rejection_reason is null;`);

async function replace(page: Page) {
  await page.getByLabel("Replacement PAN file").setInputFiles(scan);
}

test("the old row can't be removed: the new row is saved and keeps its file", async ({ browser }) => {
  const { who, ctx, page } = await rejectedPan(browser, "kyc31-del");
  await page.route("**/rest/v1/vendor_documents?id=in.*", (r) =>
    r.request().method() === "DELETE" ? r.fulfill({ status: 503, body: "{}" }) : r.continue());
  await replace(page);
  await expect(page.getByText("Couldn't upload your PAN")).toBeVisible();
  expect(panRows(who.id)).toBe("The scan is blurred,new");
  expect(newRowHasFile(who.id)).toBe("1");
  await ctx.close();
});

test("the insert's answer is lost after it saved: the row keeps its file", async ({ browser }) => {
  const { who, ctx, page } = await rejectedPan(browser, "kyc31-lost");
  await page.route("**/rest/v1/vendor_documents*", async (r) => {
    if (r.request().method() !== "POST") return r.continue();
    await r.fetch();                                  // the database saves the row...
    await r.fulfill({ status: 503, body: "{}" });     // ...and the reply is lost
  });
  await replace(page);
  await expect(page.getByText("Couldn't upload your PAN")).toBeVisible();
  expect(panRows(who.id)).toBe("The scan is blurred,new");
  expect(newRowHasFile(who.id)).toBe("1");
  await ctx.close();
});

test("the database refuses the new row: its file is removed and the rejected row stays", async ({ browser }) => {
  const { who, ctx, page } = await rejectedPan(browser, "kyc31-ref");
  await page.route("**/rest/v1/vendor_documents*", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 403, contentType: "application/json",
          body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy", details: null, hint: null }) })
      : r.continue());
  await replace(page);
  await expect(page.getByText("Couldn't upload your PAN")).toBeVisible();
  expect(panRows(who.id)).toBe("The scan is blurred");
  await expect.poll(() => newPanFiles(who.id), { timeout: 10_000 }).toBe("0");
  await ctx.close();
});

test("a replacement that goes through supersedes the rejected row", async ({ browser }) => {
  const { who, ctx, page } = await rejectedPan(browser, "kyc31-ok");
  await replace(page);
  await expect(page.getByText("PAN sent for review")).toBeVisible();
  expect(panRows(who.id)).toBe("new");
  expect(newRowHasFile(who.id)).toBe("1");
  await ctx.close();
});
