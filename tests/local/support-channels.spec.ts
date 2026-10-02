/**
 * Help & Support launch gate (P7): callbacks, fraud reports and feedback end to end, on the
 * local stack, with Resend not configured (so no screen may claim an email went).
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, clearSupport, clientAs, openAllHours, restoreHours, setRollout, signedInContext, sql, watchErrors } from "./stack";

// A 1x1 PNG: a real image, so the server-side signature check passes it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeAll(() => {
  clearSupport();
  openAllHours();
  setRollout("staff");
});
test.afterAll(() => restoreHours());

test("a vendor books a callback; Support reveals the number (logged), calls and records it; the vendor sees the outcome", async ({ browser }) => {
  const vendorCtx = await signedInContext(browser, "vendor");
  const vendor = await vendorCtx.newPage();
  const errors = watchErrors(vendor);
  await vendor.goto(`${BUYER_URL}/help/callback`);
  await vendor.getByRole("radio", { name: "Leads and quotes" }).click();
  await vendor.locator("#callback-phone").fill("+91 90000 00003");
  await vendor.getByRole("radio", { name: /^\d{2}:\d{2}–\d{2}:\d{2}$/ }).first().click();
  await vendor.locator("#callback-note").fill("About a lead from Surat");
  await vendor.getByRole("button", { name: "Book the callback" }).click();
  await expect(vendor.getByText("We'll call the number you gave. What happened on the call shows in My requests.")).toBeVisible();
  const ticketNo = sql(`select ticket_no from public.support_tickets where channel = 'callback' order by created_at desc limit 1`);

  const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const staff = await staffCtx.newPage();
  await staff.goto(`${ADMIN_URL}/support/callbacks`);
  await staff.getByText(ticketNo).first().click();
  // Masked until revealed; the reveal is an Admin Log row.
  await expect(staff.getByText("+91 90000 00003")).toHaveCount(0);
  const before = Number(sql(`select count(*) from admin.audit_log where target_table like '%support%'`));
  await staff.getByRole("button", { name: "Reveal" }).first().click();
  await expect(staff.getByText(/\+91 ?90000 ?00003|\+919000000003/)).toBeVisible();
  expect(Number(sql(`select count(*) from admin.audit_log where target_table like '%support%'`))).toBeGreaterThan(before);
  await staff.getByRole("button", { name: "Completed" }).click();
  await expect(staff.getByText("Recorded.")).toBeVisible();

  await vendor.goto(`${BUYER_URL}/help/requests/${ticketNo}`);
  await expect(vendor.getByText("We called you. If there's anything else, reply here.")).toBeVisible();
  expect(errors).toEqual([]);
  await vendorCtx.close();
  await staffCtx.close();
});

test("a fraud report with a photo: the file is checked, the reporter can't open it, the outcome stays restricted, the finding is kept", async ({ browser }) => {
  const buyerCtx = await signedInContext(browser, "buyer");
  const buyer = await buyerCtx.newPage();
  const errors = watchErrors(buyer);
  await buyer.goto(`${BUYER_URL}/report-fraud`);
  await buyer.locator("#fr-name").fill("Fake Fabrics Pvt Ltd");
  await buyer.locator("#fr-phone").fill("+91 98888 77777");
  await buyer.locator("#fr-city").fill("Ahmedabad");
  await buyer.getByRole("button", { name: "Next" }).click();
  await buyer.locator("#fr-description").fill("Took a 5,000 advance for 200 shirts and stopped replying.");
  await buyer.locator("#fr-amount").fill("5000");
  await buyer.getByRole("button", { name: "Next" }).click();
  await buyer.locator('input[type="file"]').setInputFiles({ name: "payment.png", mimeType: "image/png", buffer: PNG });
  await buyer.getByRole("button", { name: "Next" }).click();
  await buyer.getByRole("button", { name: "Send the report" }).click();
  await expect(buyer.getByText(/^We've recorded your report CS-\d{6}\.$/)).toBeVisible({ timeout: 30_000 });
  await expect(buyer.getByText(/emailed/)).toHaveCount(0); // Resend isn't configured here
  const ticketNo = (await buyer.getByText(/^We've recorded your report CS-\d{6}\.$/).innerText()).match(/CS-\d{6}/)![0];

  // The file passed the signature check, and the reporter can't read it back.
  await expect.poll(() => sql(`select a.status from public.support_attachments a join public.support_tickets t on t.id = a.ticket_id where t.ticket_no = '${ticketNo}'`)).toBe("clean");
  const path = sql(`select a.storage_path from public.support_attachments a join public.support_tickets t on t.id = a.ticket_id where t.ticket_no = '${ticketNo}'`);
  const asBuyer = await clientAs("buyer");
  const { data: leaked } = await asBuyer.storage.from("support-attachments").download(path);
  expect(leaked).toBeNull();

  // Support records the outcome on the restricted board.
  const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const staff = await staffCtx.newPage();
  await staff.goto(`${ADMIN_URL}/support/fraud`);
  await staff.getByText(ticketNo).first().click();
  await expect(staff.getByText("Fake Fabrics Pvt Ltd").first()).toBeVisible();
  await staff.locator("#fraud-outcome").selectOption("suspended");
  // Confirming fraud needs the line that stays on the lasting record.
  await expect(staff.getByRole("button", { name: "Save outcome" })).toBeDisabled();
  await staff.locator("#fraud-note").fill("Took a 5,000 advance for 200 shirts and stopped replying.");
  await staff.getByRole("button", { name: "Save outcome" }).click();
  await expect(staff.getByText("Outcome saved. The reporter is told their report was reviewed.")).toBeVisible();

  // The lasting record, shown under Confirmed fraud.
  expect(sql(`select subject_name || '|' || outcome from admin.fraud_findings where ticket_no = '${ticketNo}'`)).toBe("Fake Fabrics Pvt Ltd|suspended");
  await staff.goto(`${ADMIN_URL}/support/fraud`);
  await expect(staff.getByText("Confirmed fraud").first()).toBeVisible();
  await expect(staff.getByText("Took a 5,000 advance for 200 shirts and stopped replying.").first()).toBeVisible();

  // The reporter learns it was reviewed, and nothing about the outcome.
  await buyer.goto(`${BUYER_URL}/help/requests/${ticketNo}`);
  await expect(buyer.getByText("Our team has reviewed your report. Thank you for telling us.")).toBeVisible();
  await expect(buyer.getByText(/suspended/i)).toHaveCount(0);
  expect(errors).toEqual([]);
  await buyerCtx.close();
  await staffCtx.close();
});

test("feedback gets an ID with no email claimed; Support marks it reviewed and the sender is told", async ({ browser }) => {
  const buyerCtx = await signedInContext(browser, "buyer");
  const buyer = await buyerCtx.newPage();
  const errors = watchErrors(buyer);
  await buyer.goto(`${BUYER_URL}/feedback`);
  await buyer.getByRole("radio", { name: /Report a bug/ }).click();
  await buyer.locator("#feedback-body").fill("The category filter resets when I go back.");
  await buyer.getByRole("button", { name: "Send feedback" }).click();
  await expect(buyer.getByText("Thanks. The team reads every note.")).toBeVisible();
  const recorded = await buyer.getByText(/^We've recorded it as CS-\d{6}\.$/).innerText();
  const ticketNo = recorded.match(/CS-\d{6}/)![0];
  await expect(buyer.getByText(/emailed/)).toHaveCount(0);

  const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const staff = await staffCtx.newPage();
  await staff.goto(`${ADMIN_URL}/support/feedback`);
  await staff.getByText(ticketNo).first().click();
  await staff.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(staff.getByText("Marked reviewed.")).toBeVisible();

  await buyer.goto(`${BUYER_URL}/help/requests/${ticketNo}`);
  await expect(buyer.getByText("The team has read your feedback. Thank you.")).toBeVisible();
  expect(errors).toEqual([]);
  await buyerCtx.close();
  await staffCtx.close();
});
