// Supabase Edge Function: support-sweep
//
// Help & Support P6 (documentation/help-feature-plan.md D-16, D-21), 2026-10-01. pg_cron
// `support-sweep` posts here every 15 minutes, once Mitra approves the job
// (scripts/support-sweep-schedule.sql; nothing schedules it until then). Each run:
//   1. support_sweep_run(): closes requests resolved 7+ days ago with no reply since (the
//      requester is told), flags callback windows that ended with no call logged (staff
//      only, once), and lists what's due for deletion with the request's file paths:
//        * a fraud report a year after it was filed, once decided or closed (its
//          confirmed-fraud record in admin.fraud_findings stays);
//        * every other request of an account that has been deleted;
//   2. for each one due, deletes its files from the private support-attachments bucket
//      through the Storage API, and only then
//   3. support_sweep_purge(ids): deletes the requests whose files are gone (it re-checks
//      that each is still due) and logs the ticket number in admin.support_purge_log.
//
// ORDER. Files first, rows second: once a row is gone nothing knows where its files were.
// A Storage failure leaves the row in place, and the next run tries again.
//
// The handler requires a service_role JWT on top of the platform's verify_jwt gate
// (supabase/config.toml). Platform-provided secrets only: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Conventions as account-deletion-sweep: no imports.

const BUCKET = "support-attachments";
const BATCH = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

// Reads the `role` claim WITHOUT verifying the signature. Sound only because config.toml
// sets verify_jwt = true for this function, so the platform has already checked the token.
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)))?.role ?? null;
  } catch {
    return null;
  }
}

interface Due {
  ticket_id: string;
  ticket_no: string;
  reason: "fraud_report_one_year" | "account_deleted";
  paths: string[];
}

interface RunResult {
  closed: number;
  callbacks_flagged: number;
  purge: Due[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return json({ error: "server_misconfigured" }, 500);
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`${name} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  };

  let run: RunResult;
  try {
    run = await rpc<RunResult>("support_sweep_run", { p_limit: BATCH });
  } catch (e) {
    return json({ status: "error", step: "run", detail: String(e).slice(0, 300) }, 502);
  }

  // Files first. Only paths inside the request's own folder ({ticket_id}/…, plan A4) are
  // ever deleted; anything else is logged and the request is left for a person to look at.
  const ready: string[] = [];
  const failures: { ticket_no: string; detail: string }[] = [];
  for (const due of run.purge ?? []) {
    const paths = due.paths ?? [];
    const outside = paths.filter((p) => !p.startsWith(`${due.ticket_id}/`));
    if (outside.length > 0) {
      failures.push({ ticket_no: due.ticket_no, detail: `${outside.length} path(s) outside the request's folder; not deleted` });
      continue;
    }
    if (paths.length > 0) {
      const res = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) {
        failures.push({ ticket_no: due.ticket_no, detail: `storage delete ${res.status}: ${(await res.text()).slice(0, 160)}` });
        continue;
      }
    }
    ready.push(due.ticket_id);
  }

  let purged = 0;
  if (ready.length > 0) {
    try {
      purged = await rpc<number>("support_sweep_purge", { p_ticket_ids: ready });
    } catch (e) {
      return json({ status: "error", step: "purge", closed: run.closed, files_deleted_for: ready.length, detail: String(e).slice(0, 300) }, 502);
    }
  }
  for (const f of failures) console.warn(`[support-sweep] ${f.ticket_no}: ${f.detail}`);

  return json({
    status: failures.length ? "partial" : "ok",
    closed: run.closed,
    callbacks_flagged: run.callbacks_flagged,
    due: (run.purge ?? []).length,
    purged,
    failures,
  });
});
