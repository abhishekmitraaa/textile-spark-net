/**
 * Help & Support launch gate (P7): live chat end to end, on the local stack.
 * A buyer starts a chat; Support takes it in Cosora-Admin, replies and leaves an internal
 * note; the reply reaches the buyer's open page live and the note never does; the buyer
 * answers and ends the chat. Also: who is let in at each rollout setting, and that a
 * manager reads but can't answer.
 */
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, clearSupport, openAllHours, restoreHours, setRollout, signedInContext, sql, watchErrors } from "./stack";

test.beforeAll(() => {
  clearSupport();
  openAllHours();
  setRollout("staff");
});
test.afterAll(() => {
  restoreHours();
  setRollout("staff");
});

test("a chat reaches the inbox, the reply arrives live, the internal note stays internal", async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const buyerCtx = await signedInContext(browser, "buyer");
  const buyer = await buyerCtx.newPage();
  const buyerErrors = watchErrors(buyer);

  await buyer.goto(`${BUYER_URL}/help/chat`);
  await expect(buyer.getByText("We're open now")).toBeVisible();
  await buyer.getByRole("radio", { name: "Account and sign-in" }).click();
  await buyer.locator("#support-first-message").fill(`My login code never arrives ${stamp}`);
  await buyer.getByRole("button", { name: "Start chat" }).click();
  await expect(buyer).toHaveURL(/\/help\/requests\/CS-\d{6}$/);
  const ticketNo = buyer.url().split("/").pop()!;
  await expect(buyer.getByText(`My login code never arrives ${stamp}`)).toBeVisible();

  // Support takes it from the inbox.
  const staffCtx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const staff = await staffCtx.newPage();
  const staffErrors = watchErrors(staff);
  await staff.goto(`${ADMIN_URL}/support`);
  await staff.getByText(ticketNo).first().click();
  await expect(staff).toHaveURL(new RegExp(`/support/${ticketNo}$`));
  await expect(staff.getByText(`My login code never arrives ${stamp}`)).toBeVisible();
  await staff.getByRole("button", { name: "Take this request" }).click();
  await expect(staff.getByText("It's yours.")).toBeVisible();

  // An internal note first, then the public reply.
  await staff.getByRole("checkbox", { name: "Internal note" }).check();
  await staff.getByRole("textbox", { name: "Internal note" }).fill(`Checked the SMS log ${stamp}`);
  await staff.getByRole("button", { name: "Save note" }).click();
  await expect(staff.getByText("Internal note saved.")).toBeVisible();
  await staff.getByRole("checkbox", { name: "Internal note" }).uncheck();
  await staff.getByRole("textbox", { name: "Reply" }).fill(`Please try the code 123456 ${stamp}`);
  await staff.getByRole("button", { name: "Send reply" }).click();
  await expect(staff.getByText("Reply sent. The requester is notified in the app.")).toBeVisible();

  // The buyer's page, never reloaded, gets the reply; the note never appears.
  await expect(buyer.getByText(`Please try the code 123456 ${stamp}`)).toBeVisible({ timeout: 20_000 });
  await expect(buyer.getByText("Cosora Support").first()).toBeVisible();
  await expect(buyer.getByText(`Checked the SMS log ${stamp}`)).toHaveCount(0);
  await buyer.reload();
  await expect(buyer.getByText(`Please try the code 123456 ${stamp}`)).toBeVisible();
  await expect(buyer.getByText(`Checked the SMS log ${stamp}`)).toHaveCount(0);

  // Nothing in the requester's own reads carries the note either.
  const visible = sql(`select count(*) from public.support_messages m join public.support_tickets t on t.id = m.ticket_id
                        where t.ticket_no = '${ticketNo}' and m.visibility = 'internal'`);
  expect(Number(visible)).toBe(1);

  // The buyer answers; staff see it live.
  await buyer.getByRole("textbox", { name: "Your message" }).fill(`That worked, thanks ${stamp}`);
  await buyer.getByRole("button", { name: "Send" }).click();
  await expect(staff.getByText(`That worked, thanks ${stamp}`)).toBeVisible({ timeout: 20_000 });

  // The buyer ends the chat.
  await buyer.getByRole("button", { name: "End chat" }).click();
  await expect(buyer.getByText("End this chat?")).toBeVisible();
  await buyer.getByRole("button", { name: "End chat" }).last().click();
  await expect(buyer.getByText("You ended this chat. Reply within 7 days to reopen it.")).toBeVisible();
  expect(sql(`select status from public.support_tickets where ticket_no = '${ticketNo}'`)).toBe("resolved");

  // The bell: the reply notified the buyer.
  expect(Number(sql(`select count(*) from public.notifications n where n.profile_id = '11111111-1111-1111-1111-111111111111' and n.kind = 'support_reply'`))).toBeGreaterThan(0);

  expect(buyerErrors).toEqual([]);
  expect(staffErrors).toEqual([]);
  await buyerCtx.close();
  await staffCtx.close();
});

test("a manager can read a request but not answer it; a product moderator can't open Support", async ({ browser }) => {
  const no = sql(`select ticket_no from public.support_tickets order by created_at desc limit 1`);
  expect(no).toMatch(/^CS-\d{6}$/);

  const mgrCtx = await signedInContext(browser, "manager", { width: 1440, height: 1000 });
  const mgr = await mgrCtx.newPage();
  await mgr.goto(`${ADMIN_URL}/support/${no}`);
  await expect(mgr.getByText(/Read-only: answering support needs the Super admin or Support role/)).toBeVisible();
  await expect(mgr.getByRole("button", { name: "Send reply" })).toHaveCount(0);
  await expect(mgr.getByRole("button", { name: "Take this request" })).toHaveCount(0);
  await mgrCtx.close();

  const modCtx = await signedInContext(browser, "moderator", { width: 1440, height: 1000 });
  const mod = await modCtx.newPage();
  await mod.goto(`${ADMIN_URL}/support`);
  await expect(mod.getByText("Support inbox")).toHaveCount(0);
  await modCtx.close();
});

test("rollout: Off shuts everyone out, Staff lets in the test list only, All lets everyone in", async ({ browser }) => {
  const check = async (key: string) => {
    const ctx = await signedInContext(browser, key);
    const page = await ctx.newPage();
    await page.goto(`${BUYER_URL}/help/chat`);
    await expect(page.getByText(/Chat with Cosora Support isn't available in the app yet\.|What's it about\?/)).toBeVisible({ timeout: 30_000 });
    const open = await page.getByText("What's it about?").isVisible();
    await ctx.close();
    return open;
  };
  setRollout("staff");
  expect(await check("buyer")).toBe(true);    // on the test list
  expect(await check("buyer2")).toBe(false);  // an ordinary account
  setRollout("all");
  expect(await check("buyer2")).toBe(true);
  setRollout("off");
  expect(await check("buyer")).toBe(false);
  setRollout("staff");
});
