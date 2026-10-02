// Local stack: the support sweep end to end. Real fixtures, a real file in Storage, the
// support-sweep edge function, then the job in scripts/support-sweep-schedule.sql (pointed at
// the local gateway, every 20 seconds) firing on its own. LOCAL ONLY; run from the repo root.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const require = createRequire(resolve(process.env.LOCAL_STACK_TOOLS ?? ".claude/tmp/sb", "package.json"));
const pg = require("pg");
const env = JSON.parse(readFileSync(resolve(".claude/tmp/local-stack-env.json")));
if (!/127\.0\.0\.1|localhost/.test(env.API)) throw new Error("not local");
const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const q = async (s, p) => (await db.query(s, p)).rows;
const out = [];
const ok = (cond, label, extra = "") => out.push(`${cond ? "ok  " : "FAIL"} ${label}${extra ? ` (${extra})` : ""}`);
const BUYER = env.ids.buyer, ADMIN = env.ids.admin;

async function fixtures(tag) {
  const [resolved] = await q(`insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status, resolved_at, created_at, last_message_at)
    values ($1, 'buyer', 'chat', 'technical', $2, 'resolved', now() - interval '8 days', now() - interval '9 days', now() - interval '8 days') returning id, ticket_no`, [BUYER, `${tag} resolved long ago`]);
  await q(`insert into public.support_ticket_staff (ticket_id) values ($1)`, [resolved.id]);
  return resolved;
}

// 1) An old resolved chat, and a fraud report filed 13 months ago with a file in Storage.
const resolved = await fixtures("zz-e2e");
const [fraud] = await q(`insert into public.support_tickets (requester_id, requester_side, channel, category, subject, status, created_at, last_message_at, restricted)
  values ($1, 'buyer', 'fraud_report', 'trust_fraud', 'zz-e2e old fraud report', 'resolved', now() - interval '13 months', now() - interval '13 months', true) returning id, ticket_no`, [BUYER]);
await q(`insert into public.support_ticket_staff (ticket_id) values ($1)`, [fraud.id]);
await q(`insert into public.support_fraud_details (ticket_id, reported_name, amount_inr) values ($1, 'zz-e2e Old Trader', 12000)`, [fraud.id]);
await db.query("begin");
await db.query(`set local role authenticated`);
await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
await db.query(`select public.admin_fraud_set_outcome($1, 'warned', 'zz-e2e Sold fake GST invoices.')`, [fraud.id]);
await db.query("commit");
const path = `${fraud.id}/${crypto.randomUUID()}.png`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const up = await fetch(`${env.API}/storage/v1/object/support-attachments/${path}`, {
  method: "POST", headers: { Authorization: `Bearer ${env.SERVICE}`, apikey: env.SERVICE, "Content-Type": "image/png" }, body: png,
});
ok(up.ok, "evidence file uploaded to Storage", String(up.status));
await q(`insert into public.support_attachments (ticket_id, uploader_id, uploader_kind, kind, mime, bytes, storage_path, status, requester_can_view)
  values ($1, $2, 'requester', 'image', 'image/png', $3, $4, 'clean', false)`, [fraud.id, BUYER, png.length, path]);

// 2) The edge function, called as the cron job calls it.
const res = await fetch(`${env.API}/functions/v1/support-sweep`, { method: "POST", headers: { Authorization: `Bearer ${env.SERVICE}`, "Content-Type": "application/json" }, body: "{}" });
const body = await res.json();
ok(res.ok && body.status === "ok", "support-sweep answered", JSON.stringify(body));
ok(body.closed >= 1, "the resolved chat was closed");
ok(body.purged >= 1, "the year-old fraud report was purged");
const [t1] = await q(`select status from public.support_tickets where id = $1`, [resolved.id]);
ok(t1?.status === "closed", "resolved → closed in the table");
const [gone] = await q(`select count(*)::int n from public.support_tickets where id = $1`, [fraud.id]);
ok(gone.n === 0, "the fraud ticket row is gone");
const head = await fetch(`${env.API}/storage/v1/object/info/support-attachments/${path}`, { headers: { Authorization: `Bearer ${env.SERVICE}`, apikey: env.SERVICE } });
ok(head.status === 400 || head.status === 404, "its file is gone from Storage", String(head.status));
const [f] = await q(`select ticket_id, report_purged_at, outcome, what_happened from admin.fraud_findings where ticket_no = $1`, [fraud.ticket_no]);
ok(f && f.ticket_id === null && f.report_purged_at && f.outcome === "warned" && f.what_happened === "zz-e2e Sold fake GST invoices.", "the confirmed-fraud record stays, marked purged");
const [log] = await q(`select count(*)::int n from admin.support_purge_log where ticket_no = $1`, [fraud.ticket_no]);
ok(log.n === 1, "the purge is logged");
const [note] = await q(`select count(*)::int n from public.notifications where profile_id = $1 and title = 'Request closed'`, [BUYER]);
ok(note.n >= 1, "the requester was told the request closed");

// 3) The scheduled job itself: the approval-pending script, pointed at the local gateway, run every 20 s.
const schedule = readFileSync(resolve("scripts/support-sweep-schedule.sql"), "utf8")
  .replaceAll("https://vxdhhgdfubqedfpwfyrb.supabase.co", "http://supabase_kong_localstack:8000");
await db.query(schedule);
await q(`select cron.alter_job((select jobid from cron.job where jobname = 'support-sweep'), schedule := '20 seconds')`);
const again = await fixtures("zz-e2e-cron");
const since = new Date();
let closedByCron = false;
for (let i = 0; i < 12 && !closedByCron; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const [t] = await q(`select status from public.support_tickets where id = $1`, [again.id]);
  closedByCron = t?.status === "closed";
}
ok(closedByCron, "the cron job ran the sweep on its own and closed the next one");
const runs = await q(`select status from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'support-sweep' and d.start_time > $1`, [since]);
ok(runs.length > 0 && runs.every((r) => r.status === "succeeded"), "every cron run succeeded", runs.map((r) => r.status).join(","));
const http = await q(`select status_code from net._http_response where created > $1 order by created desc limit 3`, [since]);
ok(http.length > 0 && http.every((h) => h.status_code === 200), "the job's HTTP calls returned 200", http.map((h) => h.status_code).join(","));
await q(`select cron.unschedule('support-sweep')`);
ok((await q(`select count(*)::int n from cron.job where jobname = 'support-sweep'`))[0].n === 0, "local job removed again");

await db.end();
console.log(out.join("\n"));
console.log(`${out.filter((l) => l.startsWith("FAIL")).length} failed of ${out.length}`);
