// Bunny Stream — orphan reconciliation, READ-ONLY.
//
// The Bunny half of documentation/orphan-reconciliation.sql. That file's two
// queries diff storage.objects against product_videos, which works because both
// sides live in the same database. Bunny does not, so the diff needs the API
// key, so it needs a function.
//
// Same discipline as the SQL file, for the same reasons:
//   - It LISTS. It never deletes. An orphan costs a few MB at a provider billed
//     in GB; a wrongly deleted object is a vendor's video gone with no undo.
//     Those costs are not symmetric, so the default is list-and-look.
//   - The age guard is load-bearing. bunny-upload-url creates the Bunny video
//     BEFORE the client uploads a byte and before the product_videos row is
//     inserted, so a just-created video legitimately has no row for the whole
//     duration of an upload — longer still for a resumed one. Anything younger
//     than ORPHAN_MIN_AGE_HOURS is reported separately as "in flight", never as
//     an orphan.
//
// Two directions, because the failure modes that strand bytes also strand rows:
//   orphansAtBunny — a Bunny video no row references. The client died between
//     "video created" and "row inserted", or an admin deleted the row with
//     direct SQL, bypassing deleteProductVideo().
//   missingAtBunny — a row whose bunny_video_id Bunny does not have. Playback
//     is broken for that row right now, in the buyer feed and the moderation
//     queue alike.
//
// Admin-gated: this enumerates every vendor's video library, which is not a
// vendor's business. super_admin / product_moderator, the same pair that
// moderates product_videos.

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

function callerIdFromJwt(req: Request): string | null {
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

/**
 * MUST EXCEED bunny-upload-url's UPLOAD_WINDOW_SECONDS (6h). That constant is
 * what makes this guard provable rather than a guess: an upload cannot still be
 * in flight once its AuthorizationExpire has passed, because Bunny re-validates
 * the signature on every chunk. So anything older than the signature window
 * plus a margin genuinely cannot be a live upload — a stronger guarantee than
 * the storage-side reconciliation's "one hour is far longer than the widest
 * plausible upload" estimate in documentation/orphan-reconciliation.sql.
 *
 * Raise UPLOAD_WINDOW_SECONDS without raising this and reconciliation will list
 * uploads that are still running as orphans, for a human to delete.
 */
const ORPHAN_MIN_AGE_HOURS = 8;
const PAGE_SIZE = 100;
/** Bounded so a runaway library cannot hang the function. 50 pages = 5000 videos. */
const MAX_PAGES = 50;

interface BunnyVideo {
  guid: string;
  title: string;
  dateUploaded: string;
  status: number;
  storageSize: number;
  length: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("BUNNY_API_KEY");
  const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
  if (!apiKey || !libraryId) {
    return json({ error: "not_configured", detail: "Bunny is not configured on this project." }, 503);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);

  // ── Authorize: moderators only ────────────────────────────────────────────
  try {
    const pr = await fetch(
      `${url}/rest/v1/profiles?id=eq.${callerId}&select=is_admin,admin_role`,
      { headers: REST(serviceKey) },
    );
    const prows = pr.ok ? await pr.json() : [];
    const caller = Array.isArray(prows) && prows.length ? prows[0] : null;
    if (!caller?.is_admin || !["super_admin", "product_moderator"].includes(caller?.admin_role)) {
      return json(
        { error: "forbidden", detail: "Reconciliation requires the super_admin or product_moderator role" },
        403,
      );
    }
  } catch {
    return json({ error: "role_lookup_failed" }, 500); // fail closed
  }

  // ── The database side ─────────────────────────────────────────────────────
  let rows: { id: string; vendor_id: string; status: string; bunny_video_id: string }[] = [];
  try {
    const r = await fetch(
      `${url}/rest/v1/product_videos?provider=eq.bunny&bunny_video_id=not.is.null&select=id,vendor_id,status,bunny_video_id`,
      { headers: REST(serviceKey) },
    );
    if (!r.ok) return json({ error: "lookup_failed", detail: `${r.status}` }, 502);
    rows = await r.json();
  } catch {
    return json({ error: "lookup_failed" }, 502);
  }
  const knownGuids = new Set(rows.map((r) => r.bunny_video_id));

  // ── The Bunny side, paginated ─────────────────────────────────────────────
  const bunnyVideos: BunnyVideo[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let resp: Response;
    try {
      resp = await fetch(
        `https://video.bunnycdn.com/library/${libraryId}/videos?page=${page}&itemsPerPage=${PAGE_SIZE}`,
        { headers: { AccessKey: apiKey, accept: "application/json" } },
      );
    } catch (e) {
      return json({ error: "bunny_unreachable", detail: String(e).slice(0, 200) }, 502);
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return json({ error: "bunny_list_failed", detail: `${resp.status} ${body.slice(0, 300)}` }, 502);
    }
    const data = await resp.json().catch(() => null);
    const items: BunnyVideo[] = Array.isArray(data?.items) ? data.items : [];
    bunnyVideos.push(...items);
    if (items.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncated = true;
  }

  // ── Diff ──────────────────────────────────────────────────────────────────
  const cutoff = Date.now() - ORPHAN_MIN_AGE_HOURS * 3600 * 1000;
  const orphansAtBunny: unknown[] = [];
  const inFlight: unknown[] = [];

  for (const v of bunnyVideos) {
    if (knownGuids.has(v.guid)) continue;
    // Bunny returns dateUploaded without a zone marker; treat it as UTC.
    const uploadedMs = Date.parse(v.dateUploaded.endsWith("Z") ? v.dateUploaded : `${v.dateUploaded}Z`);
    const entry = {
      guid: v.guid,
      title: v.title,
      dateUploaded: v.dateUploaded,
      status: v.status,
      storageBytes: v.storageSize,
      seconds: v.length,
    };
    // A NaN date must not be treated as old — fail toward "in flight", which is
    // the non-destructive reading.
    if (!Number.isFinite(uploadedMs) || uploadedMs > cutoff) inFlight.push(entry);
    else orphansAtBunny.push(entry);
  }

  // missingAtBunny is only meaningful when the Bunny listing is COMPLETE.
  // Truncated at MAX_PAGES, every row whose GUID sits on an unread page looks
  // absent, and this list is documented as "playback is broken for that row
  // right now" — so a truncated run would report healthy live videos as broken
  // and invite someone to act on it. orphansAtBunny survives truncation
  // (knownGuids is always the complete DB side); this direction does not.
  const bunnyGuids = new Set(bunnyVideos.map((v) => v.guid));
  const missingAtBunny = truncated
    ? null
    : rows
        .filter((r) => !bunnyGuids.has(r.bunny_video_id))
        .map((r) => ({ id: r.id, vendorId: r.vendor_id, status: r.status, bunnyVideoId: r.bunny_video_id }));

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    bunnyVideoCount: bunnyVideos.length,
    dbRowCount: rows.length,
    truncated,
    ageGuardHours: ORPHAN_MIN_AGE_HOURS,
    orphansAtBunny,
    inFlight,
    missingAtBunny,
    note:
      "Read-only. Nothing was deleted. Review orphansAtBunny by hand before removing anything; " +
      "inFlight entries are younger than the age guard and may be uploads in progress." +
      (truncated
        ? " TRUNCATED: the library exceeded the page cap, so missingAtBunny is null rather than" +
          " wrong — raise MAX_PAGES and re-run before trusting that direction."
        : ""),
  });
});
