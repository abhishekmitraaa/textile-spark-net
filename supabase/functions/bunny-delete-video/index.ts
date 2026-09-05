// Bunny Stream — delete a video's bytes at the provider.
//
// WHY THIS IS NOT OPTIONAL
// deleteProductVideo() removes the storage objects BEFORE the row, deliberately:
// the row is the only record of where the media lives, so the other order leaves
// an object nothing in the app can ever find again. That reasoning does not stop
// applying because the bytes moved to Bunny — it gets worse, because Bunny
// storage is billed and there is no bucket listing in the SQL database to
// reconcile against. Without this function every vendor delete of a Bunny video
// would silently leak a paid asset forever.
//
// AUTHORIZATION: THE ROW IS THE ANCHOR, NOT THE REQUEST
// The client sends a product_videos.id, NOT a Bunny GUID. The function resolves
// the row with the service-role key and takes both the owner and the GUID FROM
// THAT ROW. This is the razorpay-verify-payment pattern — it reads
// `order.vendor_id` off the claimed row rather than off the JWT or the body, so
// a stolen id cannot act on someone else's account.
//
// Accepting a bunny_video_id from the body instead would be the hole: the
// service role bypasses RLS, so "delete the Bunny asset with this GUID" from an
// authenticated buyer would delete any vendor's video. There is no ownership
// information in a GUID.
//
// See bunny-upload-url's header for the shared conventions and for why
// verify_jwt = true in config.toml is load-bearing here too.

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("BUNNY_API_KEY");
  const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
  // Deliberately NOT a 200 here, unlike bunny-upload-url. On the upload path
  // `not_configured` means "fall back to Supabase Storage", which is a real and
  // safe alternative. On the delete path there is no alternative — silently
  // succeeding would tell the vendor their video is gone while the bytes stay
  // at a provider we are paying for.
  if (!apiKey || !libraryId) {
    return json({ error: "not_configured", detail: "Bunny is not configured on this project." }, 503);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);

  let payload: { rowId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const rowId = typeof payload.rowId === "string" ? payload.rowId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rowId)) {
    return json({ error: "bad_row_id" }, 400);
  }

  // ── Resolve the row, and take ownership + the GUID from it ────────────────
  let row: { vendor_id?: string; bunny_video_id?: string | null; provider?: string } | null = null;
  try {
    const r = await fetch(
      `${url}/rest/v1/product_videos?id=eq.${rowId}&select=vendor_id,bunny_video_id,provider`,
      { headers: REST(serviceKey) },
    );
    const rows = r.ok ? await r.json() : [];
    row = Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return json({ error: "lookup_failed", detail: "Could not read the video row; nothing was deleted." }, 502);
  }
  if (!row) return json({ error: "not_found" }, 404);

  // ── Who may delete it ─────────────────────────────────────────────────────
  // The owning vendor, or a product moderator. Mirrors the two role sets that
  // may already act on this table: pvideos_delete for the owner, and
  // super_admin / product_moderator for moderation.
  let allowed = row.vendor_id === callerId;
  if (!allowed) {
    try {
      const pr = await fetch(
        `${url}/rest/v1/profiles?id=eq.${callerId}&select=is_admin,admin_role`,
        { headers: REST(serviceKey) },
      );
      const prows = pr.ok ? await pr.json() : [];
      const caller = Array.isArray(prows) && prows.length ? prows[0] : null;
      allowed = Boolean(caller?.is_admin) &&
        ["super_admin", "product_moderator"].includes(caller?.admin_role);
    } catch {
      allowed = false; // fail closed
    }
  }
  if (!allowed) {
    return json({ error: "forbidden", detail: "You can only delete your own video closeup." }, 403);
  }

  // A supabase-provider row has nothing at Bunny. Report that plainly rather
  // than pretending to have deleted something — the client uses this to decide
  // it still owns the storage-object cleanup.
  if (row.provider !== "bunny" || !row.bunny_video_id) {
    return json({ ok: true, deleted: false, reason: "not_a_bunny_row" });
  }

  let delResp: Response;
  try {
    delResp = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${row.bunny_video_id}`,
      { method: "DELETE", headers: { AccessKey: apiKey, accept: "application/json" } },
    );
  } catch (e) {
    return json({ error: "bunny_unreachable", detail: String(e).slice(0, 200) }, 502);
  }

  // 404 counts as success. The delete path is retryable by design — the client
  // deletes the row only after this returns — so a retry after a partial
  // failure MUST be able to complete rather than deadlocking on an asset that
  // is already gone.
  if (!delResp.ok && delResp.status !== 404) {
    const body = await delResp.text().catch(() => "");
    return json(
      { error: "bunny_delete_failed", detail: `${delResp.status} ${body.slice(0, 300)}` },
      502,
    );
  }

  return json({ ok: true, deleted: true, alreadyGone: delResp.status === 404 });
});
