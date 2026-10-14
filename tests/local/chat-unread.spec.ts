/**
 * The Chats badge shows unread messages (2026-10-14, Mitra: "fix the chat icon, it should show number of
 * unopened messages"). It was a hardcoded 3. Local stack only (stack.ts refuses anything else).
 *   - no unread: no badge
 *   - a seller's messages arrive: the badge counts them, live, without a reload
 *   - the chat list shows the count on that chat
 *   - opening the chat clears it, including a message that arrives while it's open
 *   - a message after leaving counts again
 */
import { expect, test } from "@playwright/test";
import { BUYER_URL, contextWithSession, freshAccount, sql, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const made: string[] = [];

test.afterEach(() => {
  while (made.length) {
    const id = made.pop() as string;
    sql(`delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';`);
  }
});

test("the Chats badge counts unread messages, live, and opening the chat clears it", async ({ browser }) => {
  test.setTimeout(120_000);
  const buyer = await freshAccount(`cubuyer${tag}`);
  const seller = await freshAccount(`cuseller${tag}`, { seller: true });
  made.push(buyer.id, seller.id);
  const conv = sql(`insert into public.conversations (user_a, user_b)
                    values (least('${buyer.id}'::uuid, '${seller.id}'::uuid), greatest('${buyer.id}'::uuid, '${seller.id}'::uuid))
                    returning id`).split("\n")[0];
  const send = (body: string) =>
    sql(`insert into public.messages (conversation_id, sender_id, body) values ('${conv}', '${seller.id}', '${body}');`);

  const ctx = await contextWithSession(browser, buyer.session, { width: 390, height: 844 }, true);
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  const badge = page.getByTestId("nav-badge-chats");

  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(page.getByRole("link", { name: /Chats/ })).toBeVisible();
  await expect(badge).toHaveCount(0); // it was "3" for everyone

  // Two messages arrive while the buyer is on another page: the badge counts them without a reload.
  send(`CU ${tag} hello 1`);
  send(`CU ${tag} hello 2`);
  await expect(badge).toHaveText("2", { timeout: 20_000 });
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/cu-badge-2.png" });

  // The chat list shows the count on that chat.
  await page.goto(`${BUYER_URL}/chats`);
  const row = page.locator("button, a, div[role=button]").filter({ hasText: `CU ${tag} hello 2` }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("2");

  // Opening the chat reads it; a message arriving while it's open is read too.
  await page.goto(`${BUYER_URL}/chats/${seller.id}`);
  await expect(page.getByText(`CU ${tag} hello 2`)).toBeVisible();
  send(`CU ${tag} while open`);
  await expect(page.getByText(`CU ${tag} while open`)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => sql(`select coalesce((r.read_at >= (select max(created_at) from public.messages
                                   where conversation_id = '${conv}' and sender_id = '${seller.id}'))::text, 'none')
                                 from public.conversations c
                                 left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = '${buyer.id}'
                                where c.id = '${conv}'`), { timeout: 10_000 }).toBe("true");

  await page.goto(`${BUYER_URL}/home/new-arrivals`);
  await expect(page.getByRole("link", { name: /Chats/ })).toBeVisible();
  await expect(badge).toHaveCount(0);

  // After leaving, a new message counts again.
  send(`CU ${tag} later`);
  await expect(badge).toHaveText("1", { timeout: 20_000 });
  expect(errors).toEqual([]);
  await ctx.close();
});
