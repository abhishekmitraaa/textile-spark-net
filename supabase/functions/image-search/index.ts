// Supabase Edge Function: image-search
//
// Turns an uploaded product photo into a short text search query using a
// vision model (OpenAI GPT-4o-mini by default), which the Search page then
// runs against the normal catalogue search. Keeps the API key server-side.
//
// Required secret:   OPENAI_API_KEY      (set in Supabase -> Edge Functions -> Secrets)
// Optional secret:   IMAGE_SEARCH_MODEL  (default: gpt-4o-mini)
// Platform-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Responses (all 200 unless the request itself is malformed):
//   { query }                    a real apparel/textile photo, described
//   { error: "no_match" }        the model says this is not a product photo
//   { error: "rate_limited" }    over one of the image_search_rate_check budgets
//   { error: "not_configured" }  OPENAI_API_KEY is not set
//   { error: "vision_failed" | "request_failed" | "bad_model_output", detail? }
//
// "Not a product photo" is a real answer (2026-09-10). The model used to be
// asked for a query unconditionally, so a blank square came back as "men blue
// denim jacket" and ran a search. It now answers through Structured Outputs
// with an explicit is_apparel_or_textile verdict and is told not to guess.
//
// Rate limited as of 2026-09-10, on EVERY call that would reach OpenAI. Unlike
// embed-query there is no cache here — every photo is a billable vision call —
// so there is no cheap path to exempt. Three budgets, per
// image_search_rate_check(): global, per-IP, and per-user. The global one bounds
// spend. The per-user one is keyed on a signed JWT claim; the per-IP one on
// x-forwarded-for, which this deployment rebuilds at its edge (tested
// 2026-09-11 — see the note at the limiter call below).

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

// The caller's user id from the JWT `sub` claim, or null for an anon-key call
// (whose token has no `sub`). The signature is NOT re-verified here: verify_jwt
// is on for this function, so the platform has already rejected any request
// whose token does not validate before this code runs.
function jwtSubject(req: Request): string | null {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return typeof claims?.sub === "string" && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

const PROMPT =
  "A B2B fashion/textile buyer uploaded this photo to search a sourcing marketplace. " +
  "First decide whether the photo clearly shows an apparel, fabric, trim, accessory, or other " +
  "textile/fashion product. " +
  "If it does, set is_apparel_or_textile to true and set query to a short product search query " +
  "(3-6 words, lowercase, no punctuation) describing the main item, including colour and garment " +
  "type if visible. Example query: men white cotton polo t-shirt. " +
  "If it does not — for example a blank or solid-colour image, a screenshot, a document, a " +
  "landscape, food, a vehicle, or anything you cannot identify with confidence as such a " +
  "product — set is_apparel_or_textile to false and query to null. Do not guess.";

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "image_search_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        is_apparel_or_textile: { type: "boolean" },
        query: { type: ["string", "null"] },
      },
      required: ["is_apparel_or_textile", "query"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { image?: string; mimeType?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const { image, mimeType } = payload;
  if (!image) return json({ error: "no_image" }, 400);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    // Not wired up yet — the client shows a friendly "not configured" message.
    return json({ error: "not_configured" }, 200);
  }

  // Meter every call from here on — each one is a billable vision request.
  //
  // Per-IP key = the LEFTMOST x-forwarded-for entry. Tested against THIS
  // deployment on 2026-09-11 with a temporary probe build (v6, removed in v7)
  // that echoed the headers it received, from a client whose public IPv4 was
  // confirmed independently. Six cases, 3 requests each, plus one via curl: no
  // forged header; a forged single IPv4; a forged "a, b" pair; a forged non-IP
  // token; a forged IPv6 address; a forged X-Real-IP. In every request the
  // header that reached this code was exactly "<real>,<real>, <proxy>". No
  // forged value appeared in ANY position, and X-Real-IP never arrived. So
  // position 0 is the caller's real address here. The LAST entry is an upstream
  // proxy address that changed from request to request (13.248.105.x), so
  // "take the last entry" would key every caller on a shared proxy — do not.
  // This is observed platform behaviour on one date from one IPv4 client, not a
  // Supabase guarantee; re-run the probe if the proxy chain may have changed
  // (documentation/securityflags.md, 2026-09-11). The GLOBAL budget bounds
  // spend regardless, and the user bucket bounds any signed-in caller.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  try {
    const allowed = await rpc<boolean>("image_search_rate_check", {
      p_ip: ip,
      p_user_id: jwtSubject(req),
    });
    if (!allowed) return json({ error: "rate_limited" }, 200);
  } catch {
    // Fail OPEN. The limiter is a cost guard, not an authorisation gate, and a
    // limiter outage must not take image search down with it — the worst case
    // is a bounded amount of extra spend during an incident.
  }

  const model = Deno.env.get("IMAGE_SEARCH_MODEL") || "gpt-4o-mini";
  const media = mimeType || "image/jpeg";
  // OpenAI's vision input takes a data URL directly.
  const dataUrl = image.startsWith("data:") ? image : `data:${media};base64,${image}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        // The JSON envelope costs ~15 tokens on top of the query itself; a
        // truncated object would not parse, so leave headroom.
        max_tokens: 80,
        response_format: RESPONSE_FORMAT,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = (await resp.text()).slice(0, 300);
      return json({ error: "vision_failed", detail }, 200);
    }

    const data = await resp.json();
    const message = data?.choices?.[0]?.message;
    // A safety refusal arrives in `refusal` with no content. It is not a product
    // photo we can describe, so it is the same honest answer as a false verdict.
    if (message?.refusal) return json({ error: "no_match" }, 200);

    let result: { is_apparel_or_textile?: unknown; query?: unknown };
    try {
      result = JSON.parse(String(message?.content ?? ""));
    } catch {
      return json({ error: "bad_model_output" }, 200);
    }

    const query = typeof result.query === "string" ? result.query.trim() : "";
    if (result.is_apparel_or_textile !== true || !query) return json({ error: "no_match" }, 200);
    return json({ query });
  } catch (e) {
    return json({ error: "request_failed", detail: String(e) }, 200);
  }
});
