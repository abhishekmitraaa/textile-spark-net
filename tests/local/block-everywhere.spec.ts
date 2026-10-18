/**
 * A block stops every way of reaching the other person, and Cosora-Admin reads the whole chat
 * (Mitra, 2026-10-18; migration 20261018160200). Local stack only; needs both apps (buyer :8090, admin :5184).
 *   - a blocked seller's store shows no number, and Call Now / WhatsApp are refused
 *   - the seller doesn't see the buyer's requirement on Leads, and can't quote on it through the API
 *   - support reads the WHOLE chat: more than 1,000 messages, the photo, the PDF, the contact number
 *     (an Admin Log row), who blocked whom, and where a person deleted the chat for themselves
 * The rest of the block rules (call logs, direct requests, quote edits and accepts, review replies, lead
 * matching) are tested in SQL: test.md, 2026-10-18.
 */
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { ADMIN_URL, BUYER_URL, contextWithSession, freshAccount, signedInContext, sql, stack, watchErrors } from "./stack";

const tag = Date.now().toString(36);
const accounts: string[] = [];

test.afterAll(() => {
  for (const id of accounts) {
    sql(`delete from public.messages where conversation_id in (select id from public.conversations where user_a = '${id}' or user_b = '${id}');
         delete from public.conversations where user_a = '${id}' or user_b = '${id}';
         delete from public.quotes where vendor_id = '${id}';
         delete from public.rfqs where buyer_id = '${id}';
         update auth.users set phone = null where id = '${id}';`);
  }
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function clientFor(session: { access_token: string; refresh_token: string }) {
  const s = stack();
  const db = createClient(s.API, s.ANON, { auth: { persistSession: false } });
  await db.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return db;
}

test("a block stops numbers, calls, leads and quotes; support reads the whole chat", async ({ browser }) => {
  test.setTimeout(240_000);
  const buyer = await freshAccount(`bebuy${tag}`);
  const seller = await freshAccount(`besell${tag}`, { seller: true });
  accounts.push(buyer.id, seller.id);
  const phone = `9196${String(Date.now()).slice(-8)}`;
  sql(`update auth.users set phone = '${phone}' where id = '${buyer.id}';
       update public.vendor_profiles set phone = '9876543210', whatsapp = '9876543210' where id = '${seller.id}';`);
  const conv = sql(`insert into public.conversations (user_a, user_b)
                    values (least('${buyer.id}'::uuid, '${seller.id}'::uuid), greatest('${buyer.id}'::uuid, '${seller.id}'::uuid))
                    returning id`).split("\n")[0];
  const rfq = sql(`insert into public.rfqs (buyer_id, title, status) values ('${buyer.id}', 'BE ${tag} linen kurtas', 'active') returning id`).split("\n")[0];

  // ── The chat: a photo, a PDF, a contact card, 1,005 messages, then the buyer deletes it for themselves.
  const db = await clientFor(buyer.session);
  const up = async (name: string, body: Buffer, type: string, kind: string, label: string) => {
    const path = `${conv}/${buyer.id}/${crypto.randomUUID()}.${name.split(".").pop()}`;
    const { error: e1 } = await db.storage.from("chat-attachments").upload(path, body, { contentType: type });
    expect(e1).toBeNull();
    const { error: e2 } = await db.from("messages").insert({
      conversation_id: conv, sender_id: buyer.id, body: label, kind, attachment_path: path, attachment_name: name,
    });
    expect(e2).toBeNull();
  };
  await up("swatch.png", PNG, "image/png", "image", "📷 Photo");
  await up("size-chart.pdf", PDF, "application/pdf", "file", "📎 size-chart.pdf");
  expect((await db.rpc("share_chat_contact", { p_conversation_id: conv })).error).toBeNull();
  sql(`insert into public.messages (conversation_id, sender_id, body, created_at)
       select '${conv}', case when g % 2 = 0 then '${buyer.id}'::uuid else '${seller.id}'::uuid end,
              'BE ${tag} line ' || g, now() + make_interval(secs => g)
         from generate_series(1, 1005) g;`);
  expect((await db.rpc("chat_set_state", { p_conversation_id: conv, p_clear: true })).error).toBeNull();
  sql(`insert into public.messages (conversation_id, sender_id, body, created_at)
       values ('${conv}', '${seller.id}', 'BE ${tag} after the delete', now() + interval '2 hours');`);

  // ── The buyer blocks the seller.
  expect((await db.rpc("chat_set_block", { p_other: seller.id, p_block: true })).error).toBeNull();

  // Buyer: the seller's store shows no number, and Call Now is refused.
  const bctx = await contextWithSession(browser, buyer.session, { width: 1280, height: 900 });
  const bp = await bctx.newPage();
  await bp.goto(`${BUYER_URL}/vendor/${seller.id}`);
  await expect(bp.getByText("One of you has blocked the other.").first()).toBeVisible({ timeout: 30_000 });
  await expect(bp.getByText("9876543210")).toHaveCount(0);
  const reveal = await db.rpc("call_vendor_contact", { p_vendor_id: seller.id });
  expect(reveal.error?.message).toBe("blocked");
  await bctx.close();

  // Seller: the buyer's requirement isn't in their leads, and a quote is refused.
  const sdb = await clientFor(seller.session);
  const { data: seen } = await sdb.from("rfqs").select("id").eq("id", rfq);
  expect(seen ?? []).toHaveLength(0);
  const quote = await sdb.from("quotes").insert({ rfq_id: rfq, vendor_id: seller.id, price_per_unit: 120 });
  expect(quote.error).not.toBeNull();
  const buyerNumber = await sdb.rpc("call_buyer_contact", { p_buyer_id: buyer.id });
  expect(buyerNumber.error).not.toBeNull();
  const sctx = await contextWithSession(browser, seller.session, { width: 1280, height: 900 });
  const sp = await sctx.newPage();
  await sp.goto(`${BUYER_URL}/leads`);
  await expect(sp.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
  await sp.waitForTimeout(2000);
  await expect(sp.getByText(`BE ${tag} linen kurtas`)).toHaveCount(0);
  await sctx.close();

  // ── Support reads the whole chat.
  const actx = await signedInContext(browser, "support", { width: 1440, height: 1000 });
  const admin = await actx.newPage();
  const errors = watchErrors(admin);
  await admin.goto(`${ADMIN_URL}/chats/${conv}`);
  await expect(admin.getByText(/1,?009 messages/)).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByText(`BE ${tag} after the delete`)).toBeVisible();
  await expect(admin.getByText(`BE ${tag} line 1005`, { exact: true })).toBeAttached(); // past the old 500 cut-off
  const photo = admin.getByRole("img", { name: "Photo sent in the chat" });
  await expect(photo).toBeVisible({ timeout: 20_000 });
  expect(await photo.getAttribute("src")).toContain("/storage/v1/object/sign/chat-attachments/");
  await expect(admin.getByRole("link", { name: /size-chart\.pdf/ })).toHaveAttribute("href", /chat-attachments/);
  const before = Number(sql(`select count(*) from admin.audit_log where action = 'reveal_contact' and target_table = 'public.messages'`));
  await admin.getByRole("button", { name: "Show number" }).click();
  await expect(admin.getByText(`+${phone}`)).toBeVisible();
  expect(Number(sql(`select count(*) from admin.audit_log where action = 'reveal_contact' and target_table = 'public.messages'`))).toBe(before + 1);
  await expect(admin.getByText(/blocked .* still blocked/)).toBeVisible();
  await expect(admin.getByText(/deleted the chat for themselves here/)).toBeVisible();
  expect(errors).toEqual([]);
  await actx.close();
});
