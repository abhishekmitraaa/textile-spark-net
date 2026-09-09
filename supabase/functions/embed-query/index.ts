// Supabase Edge Function: embed-query
//
// Warms the search_query_embeddings cache for one buyer search term. It returns
// only a status — never the vector. The vector is read back server-side by
// public.search_products, so 1536 floats never cross the wire to a browser that
// has no use for them.
//
// Deliberately a separate function from generate-embedding. That one is the
// privileged queue drainer (service_role only); this one is callable by any
// signed-in or anonymous buyer. Folding them together would mean an auth
// mistake on the public path exposes the drainer.
//
// Required secret:   OPENAI_API_KEY
// Platform-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Cost exposure: a caller holding the public anon key can force an OpenAI call
// per NOVEL query (repeat queries are served from cache and cost nothing). At
// text-embedding-3-small pricing that is ~$0.00002 each. The length caps below
// bound the per-call size.
//
// Rate limited as of 2026-09-10. The limit is applied ONLY on a cache MISS,
// deliberately: a cached lookup is one indexed read and costs nothing, so
// throttling it would penalise exactly the heavy legitimate users the cache was
// built for, while saving no money. Only the billable path is metered.
//
// Two budgets are checked, per embed_query_rate_check(): per-IP, and GLOBAL. The
// global one is the one that matters — a scraper rotating IP addresses defeats
// per-IP limiting entirely, so per-IP alone would still have left the bill
// unbounded.
//
// Over budget returns 200 with ok:false, matching the not_configured convention
// below: the caller degrades to keyword search rather than seeing an error.
// Search still works throttled, it just stops being semantic for novel phrases.

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
const MIN_LEN = 2;
const MAX_LEN = 200;

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { query?: string; probe?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (payload.probe) {
    return json({ probe: true, model: MODEL, dimensions: DIMS, has_openai_key: Boolean(apiKey) });
  }

  const query = (payload.query ?? "").trim();
  if (query.length < MIN_LEN) return json({ error: "query_too_short" }, 200);
  if (query.length > MAX_LEN) return json({ error: "query_too_long" }, 200);

  // Cache check first: a hit costs one indexed lookup and no OpenAI call. This
  // is also why an unconfigured key still lets warm queries search normally.
  try {
    if (await rpc<boolean>("has_query_embedding", { p_query: query })) {
      return json({ ok: true, cached: true });
    }
  } catch (e) {
    return json({ error: "cache_check_failed", detail: String(e) }, 200);
  }

  // Same convention as bunny-upload-url / image-search: an unconfigured provider
  // returns 200 so the caller degrades to keyword search rather than erroring.
  if (!apiKey) return json({ error: "not_configured" }, 200);

  // Cache miss confirmed — from here on the call costs money, so meter it.
  // x-forwarded-for is a client-supplied header and therefore spoofable; the
  // leftmost entry is the claimed origin. It is used anyway because the GLOBAL
  // budget, which is not spoofable, is what actually bounds spend. Per-IP is
  // the courtesy layer that stops one honest runaway client, not the defence.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  try {
    const allowed = await rpc<boolean>("embed_query_rate_check", { p_ip: ip });
    if (!allowed) return json({ ok: false, error: "rate_limited" }, 200);
  } catch {
    // Fail OPEN. The rate limiter is a cost guard, not an authorisation gate,
    // and a limiter outage must not take semantic search down with it — the
    // worst case of failing open is a bounded amount of extra spend during an
    // incident, versus degrading every buyer's search to keyword-only.
  }

  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, input: query, dimensions: DIMS }),
    });
    if (!resp.ok) {
      return json({ error: "embed_failed", status: resp.status, detail: (await resp.text()).slice(0, 300) }, 200);
    }
    const data = await resp.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== DIMS) {
      return json({ error: "bad_vector", length: vec?.length ?? 0 }, 200);
    }
    await rpc<boolean>("cache_query_embedding", { p_query: query, p_embedding: JSON.stringify(vec) });
    return json({ ok: true, cached: false });
  } catch (e) {
    return json({ error: "request_failed", detail: String(e) }, 200);
  }
});
