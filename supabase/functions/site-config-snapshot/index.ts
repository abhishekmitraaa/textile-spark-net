// Supabase Edge Function: site-config-snapshot
//
// Rebuilds site-config/site.json, the one file the buyer app reads for the site theme and
// the vendor dashboard's banners (admin completion Phase 9, 2026-09-29; migration
// 20260928195051_site_content). The app reads it through the Storage CDN and falls
// back to the tables if it can't be fetched or doesn't parse (src/lib/siteConfig.ts).
//
// WHO CALLS IT, through pg_net, with the Vault service_role key:
//   * trg_site_banners_snapshot and trg_site_theme_snapshot, after every committed write
//     (one call per transaction; a rolled-back write queues nothing);
//   * pg_cron `faq-snapshots-refresh`, hourly, which rebuilds the FAQ files and this one,
//     so a lost call can't leave it stale for longer than an hour.
// The handler requires a service_role JWT on top of the platform's verify_jwt gate
// (supabase/config.toml).
//
// WHAT THE FILE HOLDS: exactly what anyone can already read. Both tables are read with the
// ANON key, so RLS (active banners that haven't ended) and the column grants (no author
// columns) apply, and the queries name their columns too:
//   { version: 1, generated_at, theme: {…} | null, banners: [{ id, title, subtitle,
//     cta_label, link_path, image_path, position, starts_at, ends_at }] }, banners in order.
// A banner that starts later is included with its start time; the app shows it from then.
//
// ALWAYS FROM COMMITTED TRUTH, as faqs-snapshot: it reads the tables when it runs, and
// after uploading reads them again; if they changed meanwhile it runs another pass (at
// most 3).
//
// CACHING: stored with Cache-Control max-age=300; Storage's Smart CDN on this project
// replaces the edge copy about a minute after an overwrite (faqs-snapshot measured ~47 s).
// Keep MAX_AGE in step with SITE_CONFIG_MAX_AGE_S in src/lib/siteConfig.ts.
//
// CONVENTIONS, as faqs-snapshot: no imports, raw Deno.serve + fetch.
// Platform-provided: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

const BUCKET = "site-config";
const FILE = "site.json";
const MAX_AGE = 300;
const MAX_PASSES = 3;

const THEME_COLUMNS = "vendor_accent,buyer_accent,success,border,ink,heading_font,body_font,updated_at";
const BANNER_COLUMNS = "id,title,subtitle,cta_label,link_path,image_path,position,starts_at,ends_at";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // The anon key makes RLS and the column grants apply to the reads. Without it the
  // explicit column lists below still hold, but inactive banners would be included.
  const readKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
  if (!url || !serviceKey || !readKey) return json({ error: "server_misconfigured" }, 500);

  const read = async (path: string): Promise<unknown[]> => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: readKey, authorization: `Bearer ${readKey}` },
    });
    if (!res.ok) throw new Error(`reading ${path.split("?")[0]} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return await res.json();
  };

  const readState = async () => {
    const [theme, banners] = await Promise.all([
      read(`site_theme?select=${THEME_COLUMNS}&limit=1`),
      read(`site_banners?select=${BANNER_COLUMNS}&order=position.asc,id.asc`),
    ]);
    return { theme: theme[0] ?? null, banners };
  };

  const upload = async (body: string) => {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${FILE}`, {
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
    if (!res.ok) throw new Error(`uploading ${FILE} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };

  const reason = await req.json().then((b) => String(b?.reason ?? "unspecified")).catch(() => "unspecified");
  let generatedAt = "";
  let passes = 0;
  let banners = 0;
  try {
    let state = await readState();
    for (;;) {
      passes++;
      generatedAt = new Date().toISOString();
      banners = state.banners.length;
      await upload(JSON.stringify({ version: 1, generated_at: generatedAt, theme: state.theme, banners: state.banners }));
      const again = await readState();
      if (JSON.stringify(again) === JSON.stringify(state)) break;
      if (passes >= MAX_PASSES) {
        return json({ status: "unsettled", reason, passes, banners, generated_at: generatedAt }, 409);
      }
      state = again; // an edit landed while uploading: build from the newer state
    }
  } catch (e) {
    return json({ status: "error", reason, passes, detail: String(e).slice(0, 300) }, 502);
  }

  return json({ status: "ok", reason, passes, banners, generated_at: generatedAt, max_age: MAX_AGE });
});
