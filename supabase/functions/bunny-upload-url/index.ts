// Bunny Stream — mint a direct-upload slot for a vendor's video closeup.
//
// WHY THIS FUNCTION EXISTS AT ALL
// Every other upload in this app goes straight from the browser to Supabase
// Storage, authorised by RLS on storage.objects (see catalogues.ts, profile.ts,
// reviews.ts, and createProductVideo's own TUS path). There is no signed-URL
// precedent here and this is deliberately the first one — not because a server
// hop is nicer, but because Bunny's TUS upload is authorised by
//
//     AuthorizationSignature = SHA256(library_id + api_key + expiration + video_id)
//
// and computing that in the browser would mean shipping BUNNY_API_KEY to every
// visitor. Bunny's own docs say it outright: "the signature must be generated
// on your server to keep your API key secure." So this function is the only
// thing in either repo that ever holds the key.
//
// WHAT LEAVES THIS FUNCTION, AND WHAT NEVER DOES
// Returned to the client: the TUS endpoint, the video GUID, the expiry, the
// signature, and the library id. The LIBRARY ID IS NOT A SECRET AND CANNOT BE
// ONE — Bunny requires it as a plain `LibraryId` request header on the client's
// own TUS request, and it appears in every playback and embed URL anyway. The
// API KEY is the secret, and it never appears in a response body, a header, a
// log line, or an error detail. Bunny error bodies are truncated before being
// echoed for the same reason.
//
// CONVENTIONS
// Copied verbatim from razorpay-create-order / subscription-create-order: no
// imports, raw Deno.serve + fetch against PostgREST with the service-role key,
// the same corsHeaders / json() / vendorIdFromJwt() / REST() helpers. This repo
// has no _shared/ directory and all nine existing functions duplicate these ~40
// lines; introducing a shared module for the tenth would leave the codebase
// half-converted, which is worse than the duplication.
//
// The manual JWT decode is sound ONLY because supabase/config.toml declares
// `[functions.bunny-upload-url] verify_jwt = true` — the platform validates the
// signature before we ever see the token, so `sub` is trustworthy. If that
// stanza is ever removed this function becomes forgeable. Same load-bearing
// assumption the payment functions rest on.

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

function vendorIdFromJwt(req: Request): string | null {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const REST = (key: string) => ({
  apikey: key,
  authorization: `Bearer ${key}`,
  "content-type": "application/json",
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// SIX hours, and the number is not arbitrary.
//
// tus-js-client sends this `headers` object on EVERY PATCH, so Bunny
// re-validates AuthorizationExpire per chunk — the expiry bounds the whole
// upload, not just its start. At one hour that is a cliff, not a window: 50 MB
// (MAX_VIDEO_BYTES) at ~15 kB/s is about 55 minutes, so a vendor on the exact
// connection this feature exists to survive would upload almost the entire file
// and then start 401ing, with all five retryDelays failing identically and no
// resume to fall back on.
//
// The cost of a longer window is that a leaked signature stays usable for
// longer — but a signature only authorises writing bytes into ONE
// already-created video object owned by the vendor it was minted for, so the
// blast radius is "someone else's clip lands in this vendor's pending video",
// which moderation then catches. That is a far cheaper failure than routinely
// dropping legitimate uploads at 95%.
//
// KEPT IN STEP WITH bunny-reconcile's ORPHAN_MIN_AGE_HOURS. That guard is only
// sound while it exceeds this window: an upload cannot still be in flight after
// its signature has expired, which is what makes the age guard provable here
// rather than the "far longer than the widest plausible upload" estimate the
// storage-side reconciliation has to settle for. Raise one and you must raise
// the other, or reconciliation starts listing live uploads as orphans.
const UPLOAD_WINDOW_SECONDS = 6 * 3600;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ── Configuration ─────────────────────────────────────────────────────────
  // `not_configured` is a 200 on purpose, matching razorpay-create-order: it is
  // the ONE response the client may treat as "fall back to the old path"
  // (Supabase Storage), because it means the provider was never set up rather
  // than that this upload failed. Every other error is a real failure and must
  // surface.
  //
  // The detail names WHICH secret is absent — names only, never values — so a
  // half-configured deploy is diagnosable from one call instead of by watching
  // uploads silently take the Supabase path forever.
  const apiKey = Deno.env.get("BUNNY_API_KEY");
  const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
  const cdnHostname = Deno.env.get("BUNNY_CDN_HOSTNAME");
  const missing = [
    apiKey ? null : "BUNNY_API_KEY",
    libraryId ? null : "BUNNY_LIBRARY_ID",
    cdnHostname ? null : "BUNNY_CDN_HOSTNAME",
  ].filter(Boolean);
  if (missing.length) {
    return json({ error: "not_configured", detail: `missing secret(s): ${missing.join(", ")}` }, 200);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const vendorId = vendorIdFromJwt(req);
  if (!vendorId) return json({ error: "unauthenticated" }, 401);

  let payload: { title?: unknown; probe?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  // The title is cosmetic inside Bunny's dashboard — it is NOT the caption
  // buyers see, which lives in product_videos.brand_line. Bounded anyway so a
  // pathological string cannot be posted through us to a third party.
  const isProbe = payload.probe === true;
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 200) : "";
  if (!isProbe && !title) return json({ error: "bad_title" }, 400);

  // ── Authorize ─────────────────────────────────────────────────────────────
  // The service-role key below bypasses RLS by design, so these are the real
  // checks for this path — the client's hidden buttons are irrelevant, exactly
  // as admin-refund-payment's comment says of its own role gate.
  //
  // Two separate conditions, and both matter:
  //   1. Is the caller a vendor at all? A signed-in BUYER has a valid JWT and
  //      would otherwise be handed an upload slot. Vendor identity is
  //      `vendor_profiles.id = auth.uid()` (20260717130100).
  //   2. Is the account active? A suspended account cannot create content —
  //      the INSERT is refused by account_is_active() on the RLS policy. Without
  //      this check we would still hand out a slot, the vendor would upload 50 MB
  //      to Bunny at our expense, and only then hit the refusal — leaving an
  //      asset at a paid provider that no row will ever reference.
  //
  // Both fail CLOSED on a lookup error, the house rule from resolveAdScope's
  // `return "none"` catch: never over-permit because a query failed.
  let vendorOk = false;
  let accountActive = false;
  try {
    const [vr, pr] = await Promise.all([
      fetch(`${url}/rest/v1/vendor_profiles?id=eq.${vendorId}&select=id`, { headers: REST(serviceKey) }),
      fetch(`${url}/rest/v1/profiles?id=eq.${vendorId}&select=account_status`, { headers: REST(serviceKey) }),
    ]);
    const vrows = vr.ok ? await vr.json() : [];
    const prows = pr.ok ? await pr.json() : [];
    vendorOk = Array.isArray(vrows) && vrows.length > 0;
    accountActive = Array.isArray(prows) && prows.length > 0 && prows[0]?.account_status === "active";
  } catch {
    return json({ error: "lookup_failed", detail: "Could not verify the account; nothing was created." }, 502);
  }

  if (!vendorOk) {
    return json({ error: "forbidden", detail: "Only a vendor account can upload a video closeup." }, 403);
  }
  if (!accountActive) {
    return json({ error: "forbidden", detail: "This account is suspended and cannot create new content." }, 403);
  }

  // Deploy-time health check. `{"probe":true}` answers "is Bunny wired up on
  // this project?" WITHOUT creating a video object — which matters, because the
  // only other way to find out is to run a real upload, and that would leave a
  // stray empty video in the library every time anyone checked.
  //
  // Deliberately placed AFTER the full authorization gate, not merely after
  // authentication: it is a diagnostic, and a diagnostic that answers to a
  // suspended account or a signed-in buyer is a small information leak for no
  // benefit. Reaching this line proves all three secrets were present, which is
  // the whole question. It reports the CDN hostname (public — it appears in
  // every playback URL) and never a secret value.
  if (isProbe) {
    return json({ configured: true, probe: true, cdnHostname });
  }

  // ── Create the Bunny video object ─────────────────────────────────────────
  // This must happen server-side regardless of the signature, because the GUID
  // it returns is an input to the signature. It also means a Bunny asset now
  // exists that no product_videos row references yet — that window is real and
  // is what bunny-reconcile's age guard exists to tolerate.
  let createResp: Response;
  try {
    createResp = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: "POST",
      headers: { AccessKey: apiKey as string, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ title }),
    });
  } catch (e) {
    // Never interpolate the key into an error. Bunny is reached over the public
    // internet from the edge runtime; a DNS/TLS failure here is a gateway error.
    return json({ error: "bunny_unreachable", detail: String(e).slice(0, 200) }, 502);
  }

  if (!createResp.ok) {
    const body = await createResp.text().catch(() => "");
    return json(
      { error: "bunny_create_failed", detail: `${createResp.status} ${body.slice(0, 300)}` },
      502,
    );
  }

  const created = await createResp.json().catch(() => null);
  const videoId = created && typeof created.guid === "string" ? created.guid : "";
  if (!videoId) {
    return json({ error: "bunny_create_failed", detail: "Bunny returned no video guid." }, 502);
  }

  const expirationTime = Math.floor(Date.now() / 1000) + UPLOAD_WINDOW_SECONDS;
  const signature = await sha256Hex(`${libraryId}${apiKey}${expirationTime}${videoId}`);

  // playbackUrl is the MP4 FALLBACK file, not the HLS manifest, and that is a
  // deliberate choice recorded in the changelog: the reel viewer plays a plain
  // <video src>, which cannot decode .m3u8 outside Safari. Bunny generates HLS
  // for every video regardless, so switching later is a URL rebuild from
  // bunny_video_id with no re-upload.
  //
  // IT 404s UNTIL ENCODING FINISHES, and it 404s FOREVER if "MP4 Fallback" was
  // not enabled in the library's Encoding tab BEFORE this upload — that setting
  // is not retroactive. See the deploy checklist in documentation/claude.md.
  return json({
    configured: true,
    videoId,
    libraryId,
    expirationTime,
    signature,
    endpoint: "https://video.bunnycdn.com/tusupload",
    playbackUrl: `https://${cdnHostname}/${videoId}/play_720p.mp4`,
    thumbnailUrl: `https://${cdnHostname}/${videoId}/thumbnail.jpg`,
  });
});
