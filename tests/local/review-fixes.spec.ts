/**
 * Code review of 2026-10-13: the database half of five fixes, checked through the same
 * API a browser uses. Local stack only (stack.ts refuses anything else).
 *
 *   1. A chat participant cannot rewrite who is in a conversation, or its preview.
 *   2. Reporting a chat: the message must belong to it, a pending report isn't repeated,
 *      and one account is limited to 10 reports a day.
 *   3. Quote-request reference images are private to the buyer, the addressed vendor and admins.
 *   4. A full CSP report table still records a new violation.
 *
 * Brought back on 2026-11-18 with migrations 20261118120000 and 130000 (the fixes never reached production); the ad
 * order tests (item 5) were dropped: that fix went out on 2026-11-16 and was
 * reworked since (SH-090, tests/local/seller-home-high.spec.ts).
 *
 * Every write is read back with the service key: a refused UPDATE can report success
 * with zero rows, so the answer alone proves nothing.
 */
import { spawn } from "node:child_process";
import { test, expect } from "@playwright/test";
import { clientAs, service, sql, stack } from "./stack";

/** admin.* isn't exposed over REST on the local stack, so reviews are read and seeded in SQL. */
const reviews = (where: string): { id: string; reported_by: string | null; status: string }[] =>
  JSON.parse(sql(`select coalesce(json_agg(json_build_object('id', id, 'reported_by', reported_by, 'status', status)), '[]') from admin.conversation_reviews where ${where}`));

const ids = () => stack().ids;

async function conversationBetween(a: string, b: string): Promise<string> {
  const db = service();
  const [user_a, user_b] = [a, b].sort();
  const { data, error } = await db.from("conversations")
    .upsert({ user_a, user_b }, { onConflict: "user_a,user_b" }).select("id").single();
  if (error || !data) throw new Error(`conversation: ${error?.message}`);
  sql(`delete from admin.conversation_reviews where conversation_id = '${data.id}'`);
  await db.from("conversations").update({ status: "active" }).eq("id", data.id);
  return data.id as string;
}

test.describe("conversation columns are server-owned", () => {
  test("a participant cannot swap the other side, forge the preview or backdate the thread", async () => {
    const { buyer, vendor, extra3 } = ids();
    const id = await conversationBetween(buyer, vendor);
    const db = service();
    await db.from("messages").insert({ conversation_id: id, sender_id: vendor, body: "real last message", kind: "text" });
    const before = (await db.from("conversations").select("*").eq("id", id).single()).data!;
    const side = before.user_a === buyer ? "user_b" : "user_a";

    const me = await clientAs("buyer");
    await me.from("conversations").update({ [side]: extra3 }).eq("id", id);
    await me.from("conversations").update({ last_message: "forged preview" }).eq("id", id);
    await me.from("conversations").update({ created_at: "2020-01-01T00:00:00Z" }).eq("id", id);

    const after = (await db.from("conversations").select("*").eq("id", id).single()).data!;
    expect(after.user_a).toBe(before.user_a);
    expect(after.user_b).toBe(before.user_b);
    expect(after.last_message).toBe("real last message");
    expect(after.created_at).toBe(before.created_at);
  });

  test("the app's own writes still work: find-or-create, and a message moves the preview", async () => {
    const { buyer, vendor } = ids();
    const id = await conversationBetween(buyer, vendor);
    const me = await clientAs("buyer");
    const [user_a, user_b] = [buyer, vendor].sort();
    const again = await me.from("conversations")
      .upsert({ user_a, user_b }, { onConflict: "user_a,user_b" }).select("id, status").single();
    expect(again.error).toBeNull();
    expect(again.data?.id).toBe(id);

    const body = `hello ${Date.now()}`;
    const sent = await me.from("messages").insert({ conversation_id: id, sender_id: buyer, body, kind: "text" });
    expect(sent.error).toBeNull();
    const row = (await service().from("conversations").select("last_message").eq("id", id).single()).data!;
    expect(row.last_message).toBe(body);
  });
});

test.describe("reporting a chat", () => {
  test("a message from another conversation is refused", async () => {
    const { buyer, vendor, extra1 } = ids();
    const mine = await conversationBetween(buyer, vendor);
    const other = await conversationBetween(vendor, extra1);
    const db = service();
    const foreign = (await db.from("messages")
      .insert({ conversation_id: other, sender_id: vendor, body: "not yours", kind: "text" })
      .select("id").single()).data!;

    const me = await clientAs("buyer");
    const r = await me.rpc("submit_report", { p_conversation_id: mine, p_message_id: foreign.id, p_reported_reason: "x" });
    expect(r.error).not.toBeNull();
    expect(reviews(`conversation_id = '${mine}'`)).toHaveLength(0);
  });

  test("a second report while one is pending adds nothing and sends no second notice", async () => {
    const { buyer, vendor } = ids();
    const id = await conversationBetween(buyer, vendor);
    const db = service();
    const notices = async () => (await db.from("notifications").select("id", { count: "exact", head: true })
      .eq("profile_id", vendor).eq("kind", "chat_locked").eq("conversation_id", id)).count ?? 0;
    const start = await notices();

    const me = await clientAs("buyer");
    for (let i = 0; i < 3; i++) {
      const r = await me.rpc("submit_report", { p_conversation_id: id, p_message_id: null, p_reported_reason: "spam" });
      expect(r.error).toBeNull();
    }
    const rows = reviews(`conversation_id = '${id}'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].reported_by).toBe(buyer);
    expect(await notices()).toBe(start + 1);
    const conv = (await db.from("conversations").select("status").eq("id", id).single()).data!;
    expect(conv.status).toBe("under_review");
  });

  test("the eleventh report in a day is refused", async () => {
    const { buyer2, vendor, extra2 } = ids();
    const db = service();
    const filler = await conversationBetween(buyer2, extra2);
    sql(`delete from admin.conversation_reviews where reported_by = '${buyer2}';
         insert into admin.conversation_reviews (conversation_id, source, status, reported_by)
         select '${filler}', 'user_report', 'resumed', '${buyer2}' from generate_series(1, 10);`);

    const id = await conversationBetween(buyer2, vendor);
    const me = await clientAs("buyer2");
    const r = await me.rpc("submit_report", { p_conversation_id: id, p_message_id: null, p_reported_reason: "again" });
    expect(r.error?.message ?? "").toContain("try again tomorrow");
    const conv = (await db.from("conversations").select("status").eq("id", id).single()).data!;
    expect(conv.status).toBe("active");
    sql(`delete from admin.conversation_reviews where reported_by = '${buyer2}'`);
  });

  test("two reports at once at the ninth can't both pass the limit", async () => {
    const { buyer2, vendor, extra2, extra3 } = ids();
    const filler = await conversationBetween(buyer2, extra2);
    const a = await conversationBetween(buyer2, vendor);
    const b = await conversationBetween(buyer2, extra3);
    sql(`delete from admin.conversation_reviews where reported_by = '${buyer2}';
         insert into admin.conversation_reviews (conversation_id, source, status, reported_by)
         select '${filler}', 'user_report', 'resumed', '${buyer2}' from generate_series(1, 9);`);
    const as = (conv: string, hold: string) => `begin;
      select set_config('request.jwt.claims', json_build_object('sub', '${buyer2}', 'role', 'authenticated')::text, true);
      set local role authenticated;
      select public.submit_report('${conv}', null, 'race');
      ${hold}
      commit;`;
    // A holds its transaction open after its report; B starts meanwhile, waits on the lock, then counts 10.
    const first = runPsql(as(a, "select pg_sleep(2);"));
    await new Promise((r) => setTimeout(r, 700));
    const second = runPsql(as(b, ""));
    const [ra, rb] = await Promise.all([first, second]);
    expect(ra.code).toBe(0);
    expect(rb.code).not.toBe(0);
    expect(rb.out).toContain("try again tomorrow");
    expect(reviews(`reported_by = '${buyer2}'`)).toHaveLength(10);
    sql(`delete from admin.conversation_reviews where reported_by = '${buyer2}'`);
  });
});

function runPsql(q: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const ps = spawn("docker", ["exec", "-i", "supabase_db_localstack", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    ps.stdout.on("data", (d) => { out += d; });
    ps.stderr.on("data", (d) => { out += d; });
    ps.on("close", (code) => resolve({ code: code ?? 1, out }));
    ps.stdin.end(q);
  });
}

test.describe("quote-request reference images", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

  test("private to the buyer, the addressed vendor and nobody else", async () => {
    const { buyer, vendor } = ids();
    const db = service();
    const me = await clientAs("buyer");
    const path = `${buyer}/rfq/${crypto.randomUUID()}/0.png`;

    const up = await me.storage.from("rfq-attachments").upload(path, png, { contentType: "image/png" });
    expect(up.error).toBeNull();

    const html = await me.storage.from("rfq-attachments")
      .upload(`${buyer}/rfq/${crypto.randomUUID()}/0.html`, Buffer.from("<script>1</script>"), { contentType: "text/html" });
    expect(html.error).not.toBeNull();

    const rfq = await me.from("rfqs").insert({
      buyer_id: buyer, vendor_id: vendor, title: `Review fix ${Date.now()}`,
      product_name: "Polo", quantity: 10, status: "active",
      customization_requested: true, customization_images: [path],
    }).select("id").single();
    expect(rfq.error).toBeNull();

    // Signed out: no public URL serves it.
    const open = await fetch(`${stack().API}/storage/v1/object/public/rfq-attachments/${path}`);
    expect(open.ok).toBe(false);

    const mine = await me.storage.from("rfq-attachments").createSignedUrl(path, 60);
    expect(mine.error).toBeNull();
    const theirs = await (await clientAs("vendor")).storage.from("rfq-attachments").createSignedUrl(path, 60);
    expect(theirs.error).toBeNull();
    expect((await fetch(theirs.data!.signedUrl)).ok).toBe(true);
    const stranger = await (await clientAs("extra1")).storage.from("rfq-attachments").createSignedUrl(path, 60);
    expect(stranger.error).not.toBeNull();

    await db.from("rfqs").delete().eq("id", rfq.data!.id);
  });

  test("a request cannot list a file from another account's folder", async () => {
    const { buyer, buyer2, vendor } = ids();
    const db = service();
    const me = await clientAs("buyer");
    const title = `Review fix foreign ${Date.now()}`;
    const r = await me.from("rfqs").insert({
      buyer_id: buyer, vendor_id: vendor, title,
      product_name: "Polo", quantity: 10, status: "active",
      customization_requested: true, customization_images: [`${buyer2}/rfq/someone-elses/0.png`],
    });
    expect(r.error).not.toBeNull();
    const rows = (await db.from("rfqs").select("id").eq("title", title)).data!;
    expect(rows).toHaveLength(0);
  });
});

test.describe("CSP reports", () => {
  test("a full table still records a new violation, and keeps the ones seen often", async () => {
    const db = service();
    const tag = `/zz-fill-${Date.now()}`;
    // A run that failed half-way leaves its filler behind.
    await db.from("csp_violations").delete().like("document_path", "/zz-fill-%");
    const have = (await db.from("csp_violations").select("id", { count: "exact", head: true })).count ?? 0;
    const need = Math.max(0, 5000 - have);
    for (let i = 0; i < need; i += 500) {
      const batch = Array.from({ length: Math.min(500, need - i) }, (_, k) => ({
        directive: "script-src", blocked: "https://junk.example", document_path: `${tag}/${i + k}`, source: "",
      }));
      const ins = await db.from("csp_violations").insert(batch);
      expect(ins.error).toBeNull();
    }
    const real = { directive: "img-src", blocked: "https://often.example", document_path: `${tag}/real`, source: "" };
    await db.from("csp_violations").delete().match(real);
    await db.from("csp_violations").update({ ...real, hits: 500 }).eq("document_path", `${tag}/0`);

    const anon = (await import("@supabase/supabase-js")).createClient(stack().API, stack().ANON, { auth: { persistSession: false } });
    const fresh = { directive: "connect-src", blocked: "https://new.example", document_path: `${tag}/fresh`, source: "" };
    const r = await anon.rpc("csp_report_ingest", { p_reports: [fresh] });
    expect(r.error).toBeNull();

    const landed = (await db.from("csp_violations").select("hits").match(fresh)).data!;
    expect(landed).toHaveLength(1);
    const kept = (await db.from("csp_violations").select("hits").match(real)).data!;
    expect(kept).toHaveLength(1);
    const total = (await db.from("csp_violations").select("id", { count: "exact", head: true })).count ?? 0;
    expect(total).toBeLessThanOrEqual(5000);

    // However the hit counts were inflated, a new report is still recorded, and the row seen most stays.
    await db.from("csp_violations").update({ hits: 2 }).like("document_path", `${tag}/1%`);
    const late = { directive: "connect-src", blocked: "https://late.example", document_path: `${tag}/late`, source: "" };
    expect((await anon.rpc("csp_report_ingest", { p_reports: [late] })).error).toBeNull();
    expect((await db.from("csp_violations").select("hits").match(late)).data).toHaveLength(1);
    expect((await db.from("csp_violations").select("hits").match(real)).data).toHaveLength(1);

    await db.from("csp_violations").delete().like("document_path", `${tag}%`);
  });
});
