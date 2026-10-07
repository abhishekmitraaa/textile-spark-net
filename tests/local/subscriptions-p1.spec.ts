/**
 * Subscriptions P1 (2026-10-08): billing core, on the local stack (checkouts take the demo
 * path there):
 *   * A demo purchase is completed by the one fulfilment transaction. Its invoice says it
 *     took no money, splits the GST into CGST and SGST for a seller in Cosora's state of
 *     supply, and downloads as a PDF (invoice-render, the private invoices bucket).
 *   * Another seller can't open it.
 *   * Finance sees a billing incident on Cosora-Admin's Subscriptions page and resolves it
 *     with a note, which goes to the Admin Log; an admin opens an invoice's PDF there.
 *
 * invoice-render: a local stack started before the function existed doesn't serve it
 * (supabase start only serves the functions present when it started). Set
 * LOCAL_INVOICE_RENDER_URL to an edge runtime that does (scripts/local-stack/README.md),
 * and the browser's calls to it are sent there.
 * Cleanup is in afterEach: the switch's list, and this run's incidents.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  ADMIN_URL, BUYER_URL, allowFeature, contextWithSession, disallowFeature, freshAccount, signedInContext, sql, stack, watchErrors,
} from "./stack";

const FLAG = "subscription_checkout";
const listed: string[] = [];
const incidentRefs: string[] = [];

test.afterEach(() => {
  while (listed.length) disallowFeature(FLAG, listed.pop() as string);
  while (incidentRefs.length) sql(`delete from admin.billing_incidents where order_ref = '${incidentRefs.pop()}'`);
});

/** Send invoice-render to LOCAL_INVOICE_RENDER_URL when the stack doesn't serve it. */
async function routeInvoiceRender(ctx: BrowserContext): Promise<void> {
  const target = process.env.LOCAL_INVOICE_RENDER_URL;
  if (!target) return;
  await ctx.route(`${stack().API}/functions/v1/invoice-render`, async (route) => {
    const response = await route.fetch({ url: target });
    await route.fulfill({ response });
  });
}

test("a demo purchase's invoice says no money was taken, splits the GST, and downloads as a PDF", async ({ browser }) => {
  test.setTimeout(150_000);
  const who = await freshAccount("p1-invoice", { seller: true });
  // A seller in Gujarat with no GSTIN; no billing details are set, so supply stays intra-state.
  sql(`update public.vendor_profiles set state = 'Gujarat', state_code = 'GJ', address_line = '12 Ring Road', postal_code = '395002'
        where id = '${who.id}'`);
  allowFeature(FLAG, who.id);
  listed.push(who.id);

  const ctx = await contextWithSession(browser, who.session, { width: 1440, height: 1000 });
  await routeInvoiceRender(ctx);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${BUYER_URL}/subscription`);
  await page.getByRole("button", { name: /^Choose Basic/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Basic activated \(demo mode\)/)).toBeVisible({ timeout: 30_000 });

  const row = sql(`select id || '|' || document_type || '|' || payment_mode || '|' || invoice_number || '|' || total_paise || '|' || supply_type
                     from public.subscription_invoices where vendor_id = '${who.id}'`);
  const [invoiceId, doc, mode, number, total, supply] = row.split("|");
  expect([doc, mode, total]).toEqual(["demo", "demo", "82500"]);
  expect(number).toMatch(/^DMO\/\d{4}\/\d{6}$/);
  expect(sql(`select status from public.subscription_payment_orders where vendor_id = '${who.id}'`)).toBe("paid");

  await page.goto(`${BUYER_URL}/subscription/invoice/${invoiceId}`);
  await expect(page.getByTestId("invoice-title")).toHaveText("DEMO DOCUMENT");
  await expect(page.getByTestId("invoice-notice")).toHaveText("Demo checkout: no payment was taken. Not a tax invoice.");
  await expect(page.getByText(number)).toBeVisible();
  await expect(page.getByTestId("invoice-recipient")).toContainText(`p1-invoice Textiles`);
  await expect(page.getByTestId("invoice-recipient")).toContainText("GSTIN: not registered");
  // ₹699 + ₹126 GST: half each as CGST and SGST, unless billing details set on this stack put
  // Cosora in another state, when it is all IGST.
  if (supply === "inter") {
    await expect(page.getByTestId("invoice-igst")).toContainText("₹126.00");
  } else {
    await expect(page.getByTestId("invoice-cgst")).toContainText("₹63.00");
    await expect(page.getByTestId("invoice-sgst")).toContainText("₹63.00");
  }
  await expect(page.getByTestId("invoice-total")).toHaveText("₹825.00");

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`${number.replace(/\//g, "-")}.pdf`);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(sql(`select pdf_url from public.subscription_invoices where id = '${invoiceId}'`)).toMatch(new RegExp(`^${who.id}/DMO-`));
  expect(errors).toEqual([]);

  // Another seller gets "not found", not the invoice.
  const other = await freshAccount("p1-other", { seller: true });
  const otherCtx = await contextWithSession(browser, other.session, { width: 1440, height: 1000 });
  const otherPage = await otherCtx.newPage();
  await otherPage.goto(`${BUYER_URL}/subscription/invoice/${invoiceId}`);
  await expect(otherPage.getByText("Invoice not found")).toBeVisible();
  await otherCtx.close();
  await ctx.close();
});

test("finance resolves a billing incident with a note, and opens an invoice's PDF", async ({ browser }) => {
  test.setTimeout(120_000);
  const vendorId = stack().ids.vendor;
  const ref = `order_p1spec_${Date.now().toString(36)}`;
  const note = `P1 spec: plan changed by hand (${ref})`;
  incidentRefs.push(ref);
  sql(`select admin.billing_incident_open('activation_failed', '${vendorId}', '${ref}', 'pay_${ref}',
         '{"reason": "already_scheduled", "amount_paise": 271300, "plan_id": "gold"}'::jsonb);`);

  const ctx = await signedInContext(browser, "admin", { width: 1440, height: 1000 });
  await routeInvoiceRender(ctx);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(`${ADMIN_URL}/subscriptions`);
  await expect(page.getByRole("heading", { name: "Billing incidents" })).toBeVisible();
  const card = page.getByTestId("billing-incidents").locator("div.rounded-xl", { hasText: ref });
  await expect(card.getByText("Paid, plan not activated")).toBeVisible();
  await expect(card.getByText("₹2,713")).toBeVisible();
  await expect(card.getByText("already_scheduled")).toBeVisible();

  await card.getByRole("button", { name: "Resolve" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Mark resolved" })).toBeDisabled();
  await dialog.getByLabel("What was done").fill(note);
  await dialog.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByText("Incident resolved")).toBeVisible();
  await expect(page.getByTestId("billing-incidents").locator("div.rounded-xl", { hasText: ref })).toHaveCount(0);
  expect(sql(`select resolution from admin.billing_incidents where order_ref = '${ref}'`)).toBe(note);
  expect(sql(`select count(*) from admin.audit_log where target_table = 'admin.billing_incidents' and reason = '${note}'`)).toBe("1");

  // The invoice list's PDF button: drawn once, signed by the admin's own session.
  const signed = ctx.waitForEvent("response", (r) => r.url().includes("/storage/v1/object/sign/invoices/") && r.request().method() === "GET");
  await page.getByRole("button", { name: "PDF", exact: true }).first().click();
  const response = await signed;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  expect(errors).toEqual([]);
  await ctx.close();
});
