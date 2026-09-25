// Supabase Edge Function: faqs-snapshot
//
// Rebuilds the three public FAQ snapshots in the `faq-snapshots` Storage bucket
// (Phase 23 of the My Profile brief, 2026-09-24; Phase 9 Q2):
//   buyer_help.json, seller_registration.json, subscription.json
// The buyer app reads these through the Storage CDN instead of querying
// public.faqs on every page load, and falls back to the table if a file can't be
// fetched or doesn't parse (src/lib/queries/faqs.ts).
//
// WHO CALLS IT, through pg_net, with the Vault service_role key:
//   * trg_faqs_snapshot on public.faqs, after every committed write (one call per
//     transaction; a rolled-back write queues nothing);
//   * pg_cron `faq-snapshots-refresh`, hourly, so a lost call can't leave a file
//     stale for longer than an hour.
// The handler requires a service_role JWT on top of the platform's verify_jwt gate
// (supabase/config.toml).
//
// WHAT A FILE HOLDS: exactly what anyone can already read from the table. The rows
// are read with the ANON key, so RLS (active rows only) and the column grant (no
// created_by) apply, and the query also names its filter and columns:
//   { version: 1, surface, generated_at, count, rows: [{ id, category_label,
//     question, answer, position }] }, rows in display order.
// A surface with no active FAQs gets a file with rows: [], which is the truth,
// not a failure.
//
// ALWAYS FROM COMMITTED TRUTH: the function reads the table when it runs, not a
// payload from the trigger. Two edits in quick succession each start a call; if
// an older call uploads after a newer one, the files could briefly show the older
// state. So after uploading, it reads the rows again and, if they changed, runs
// another pass (at most 3).
//
// CACHING: each file is stored with Cache-Control max-age=300. Storage answers with
// `x-smart-cdn: true` on this project (Supabase documents Smart CDN as Pro only;
// this Free-plan project has it): the edge keeps a copy until the file changes, and
// an overwrite invalidates it. Measured 2026-09-24: the rebuilt file is at the origin
// 2–3 s after the edit, and ~47 s after it no request gets the old copy
// (scripts/faq-cdn-propagation.mjs). max-age bounds browsers, and would bound the
// edge if Smart CDN were ever off. Keep MAX_AGE in step with FAQ_SNAPSHOT_MAX_AGE_S
// in faqs.ts.
//
// CONVENTIONS, as fx-rates-refresh: no imports, raw Deno.serve + fetch.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

const BUCKET = "faq-snapshots";
const SURFACES = ["buyer_help", "seller_registration", "subscription"] as const;
const MAX_AGE = 300;
const MAX_PASSES = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Reads the `role` claim WITHOUT verifying the signature. Sound only because
// config.toml sets verify_jwt = true for this function, so the platform has
// already validated the token before this handler runs.
function jwtRole(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return JSON.parse(payload)?.role ?? null;
  } catch {
    return null;
  }
}

interface Row {
  id: string;
  surface: string;
  category_label: string | null;
  question: string;
  answer: string;
  position: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // The anon key makes RLS and the column grant apply to the read. Without it the
  // explicit filter and column list below still hold.
  const readKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
  if (!url || !serviceKey || !readKey) return json({ error: "server_misconfigured" }, 500);

  const readRows = async (): Promise<Row[]> => {
    const res = await fetch(
      `${url}/rest/v1/faqs?select=id,surface,category_label,question,answer,position` +
        `&active=eq.true&order=surface.asc,position.asc,created_at.asc,id.asc`,
      { headers: { apikey: readKey, authorization: `Bearer ${readKey}` } },
    );
    if (!res.ok) throw new Error(`reading faqs answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  };

  const upload = async (surface: string, body: string) => {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${surface}.json`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        "cache-control": `max-age=${MAX_AGE}`,
        "x-upsert": "true",
      },
      body,
    });
    if (!res.ok) throw new Error(`uploading ${surface}.json answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };

  const reason = await req.json().then((b) => String(b?.reason ?? "unspecified")).catch(() => "unspecified");
  const counts: Record<string, number> = {};
  let generatedAt = "";
  let passes = 0;
  try {
    let rows = await readRows();
    for (;;) {
      passes++;
      generatedAt = new Date().toISOString();
      for (const surface of SURFACES) {
        const mine = rows
          .filter((r) => r.surface === surface)
          .map(({ id, category_label, question, answer, position }) => ({ id, category_label, question, answer, position }));
        counts[surface] = mine.length;
        await upload(surface, JSON.stringify({ version: 1, surface, generated_at: generatedAt, count: mine.length, rows: mine }));
      }
      const again = await readRows();
      if (JSON.stringify(again) === JSON.stringify(rows)) break;
      if (passes >= MAX_PASSES) {
        return json({ status: "unsettled", reason, passes, counts, generated_at: generatedAt }, 409);
      }
      rows = again; // an edit landed while uploading: build from the newer state
    }
  } catch (e) {
    return json({ status: "error", reason, passes, detail: String(e).slice(0, 300) }, 502);
  }

  return json({ status: "ok", reason, passes, counts, generated_at: generatedAt, max_age: MAX_AGE });
});
