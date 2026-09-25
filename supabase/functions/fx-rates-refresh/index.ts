// Supabase Edge Function: fx-rates-refresh
//
// Refreshes public.fx_rates, the one-row cache of INR → USD/EUR/GBP rates that the
// buyer app uses to show prices in a buyer's chosen currency (Phase 20 of the My
// Profile brief, 2026-09-24, MPF-11). pg_cron `fx-rates-refresh` posts here once
// a day, the way `embedding-worker` drives generate-embedding and
// `account-deletion-sweep` drives its function.
//
// DISPLAY ONLY. These rates convert a price for display. Nothing is priced,
// quoted, charged, settled or invoiced in another currency: vendors quote and are
// paid in INR, and Cosora's plans and GST invoices are INR.
//
// SOURCE: Frankfurter (https://frankfurter.dev), free, no API key, no account.
//   Primary:  /v1/latest?base=EUR&symbols=INR,USD,GBP, the European Central
//             Bank's euro reference rates, published once per working day
//             (around 16:00 CET), at full ECB precision (e.g. INR 109.0775).
//   Fallback: /v2/rates?base=EUR&quotes=INR,USD,GBP (a list of {quote, rate}),
//             Frankfurter's multi-source endpoint, if v1 ever fails.
//   Asking for INR as the base returns 5-decimal numbers (0.01044, three
//   significant figures), so the INR rates are computed from the EUR ones:
//   USD per INR = (USD per EUR) / (INR per EUR).
// On any failure the stored row is left as it was, and the response says why.
//
// Invoked by pg_cron through pg_net only. The handler requires a service_role
// JWT on top of the platform's verify_jwt gate (supabase/config.toml).
// Platform-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. No other secret.
//
// CONVENTIONS, as account-deletion-sweep: no imports, raw Deno.serve + fetch
// against PostgREST with the service-role key.

const QUOTES = ["USD", "EUR", "GBP"] as const;

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

interface EurRates { date: string; perEur: Record<string, number>; source: string }

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

async function fromV1(): Promise<EurRates> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=INR,USD,GBP");
  if (!res.ok) throw new Error(`v1 answered ${res.status}`);
  const body = await res.json();
  if (typeof body?.date !== "string" || typeof body?.rates !== "object") throw new Error("v1: unexpected shape");
  return { date: body.date, perEur: body.rates, source: "frankfurter v1 (ECB euro reference rates)" };
}

async function fromV2(): Promise<EurRates> {
  const res = await fetch("https://api.frankfurter.dev/v2/rates?base=EUR&quotes=INR,USD,GBP");
  if (!res.ok) throw new Error(`v2 answered ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body) || !body.length) throw new Error("v2: unexpected shape");
  const perEur: Record<string, number> = {};
  for (const r of body) if (typeof r?.quote === "string") perEur[r.quote] = r.rate;
  return { date: String(body[0].date), perEur, source: "frankfurter v2 (multi-source)" };
}

/** INR-based rates from EUR-based ones, or why they can't be trusted. */
function toInrBase(e: EurRates): Record<string, number> | string {
  const inr = e.perEur.INR;
  // A sanity band, not a forecast: the rupee has been 60–120 to the euro for
  // two decades. Outside it, the response is broken, not the market.
  if (!positive(inr) || inr < 40 || inr > 400) return `INR per EUR is ${inr}`;
  const rates: Record<string, number> = { INR: 1, EUR: 1 / inr };
  for (const q of QUOTES) {
    if (q === "EUR") continue;
    if (!positive(e.perEur[q])) return `${q} per EUR is ${e.perEur[q]}`;
    rates[q] = e.perEur[q] / inr;
  }
  // 8 significant figures is far below any display rounding.
  for (const k of Object.keys(rates)) rates[k] = Number(rates[k].toPrecision(8));
  return rates;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);
  const rest = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };

  let fetched: EurRates;
  const errors: string[] = [];
  try {
    fetched = await fromV1();
  } catch (e) {
    errors.push(String(e));
    try {
      fetched = await fromV2();
    } catch (e2) {
      errors.push(String(e2));
      return json({ status: "source_failed", errors }, 502);
    }
  }

  const rates = toInrBase(fetched);
  if (typeof rates === "string") return json({ status: "rejected", reason: rates, source: fetched.source }, 502);

  const prevRes = await fetch(`${url}/rest/v1/fx_rates?base_currency=eq.INR&select=rates,rates_date`, { headers: rest });
  const prev = prevRes.ok ? (await prevRes.json())[0] ?? null : null;

  const row = {
    base_currency: "INR",
    rates,
    rates_date: fetched.date,
    source: fetched.source,
    updated_at: new Date().toISOString(),
  };
  const saved = await fetch(`${url}/rest/v1/fx_rates?on_conflict=base_currency`, {
    method: "POST",
    headers: { ...rest, prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!saved.ok) {
    return json({ status: "save_failed", code: saved.status, detail: (await saved.text()).slice(0, 300) }, 500);
  }

  return json({
    status: "ok",
    rates_date: fetched.date,
    source: fetched.source,
    rates,
    changed: !prev?.rates || Object.keys(rates).some((k) => Number(prev.rates[k]) !== rates[k]),
    fallback_errors: errors.length ? errors : undefined,
  });
});
