// Help & Support — check an uploaded support file before anyone can see it.
//
// WHY
// A support file (a photo, a PDF, a voice note) is uploaded straight from the browser
// to the private support-attachments bucket, to a path support_prepare_upload() or
// admin_support_prepare_upload() reserved. The bucket's allowed_mime_types only checks
// the Content-Type the browser DECLARED. So a file stays `pending`, invisible to the
// requester and to staff (support_attachment_read_allowed() admits only `clean`), until
// this function has read its first bytes and found the format it claims to be, and
// storage serves it as the type it was reserved as (plan A4; the OWASP file-upload rule
// "validate the signature, not the Content-Type"). A message can only carry a `clean`
// file (admin.support_check_files), so the client runs this before it sends.
//
// It is not a malware scanner. PDFs are download-only in Cosora-Admin. A scanner is
// chosen before video or signed-out uploads (plan A4, open decision).
//
// AUTHORIZATION: THE ROW IS THE ANCHOR
// The client sends a support_attachments.id. The row is read with the service-role key,
// and the path, the declared type and the uploader come FROM THE ROW. Only the uploader
// may ask for their own file to be checked. verify_jwt = true in config.toml, so the
// platform has already verified the token this function decodes.
//
// Returns {status: "clean" | "rejected" | "pending", reason?}. A rejected file is also
// deleted from storage.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "support-attachments";
// Mirrors admin.support_reserve_upload(): 10 MB for a PDF, 5 MB otherwise.
const CAP: Record<string, number> = { pdf: 10 * 1024 * 1024, image: 5 * 1024 * 1024, audio: 5 * 1024 * 1024 };

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

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Does the file start the way its declared type says it must? */
function signatureMatches(mime: string, b: Uint8Array): boolean {
  switch (mime) {
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
    case "image/webp":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    case "application/pdf":
      return ascii(b, 0, 5) === "%PDF-";
    case "audio/webm":
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "audio/ogg":
      return ascii(b, 0, 4) === "OggS";
    case "audio/mp4":
    case "audio/x-m4a":
      return ascii(b, 4, 8) === "ftyp";
    case "audio/aac":
      return (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) || ascii(b, 0, 4) === "ADIF";
    case "audio/mpeg":
      return ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "audio/wav":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE";
    default:
      return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const callerId = callerIdFromJwt(req);
  if (!callerId) return json({ error: "unauthenticated" }, 401);

  let payload: { attachmentId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const id = typeof payload.attachmentId === "string" ? payload.attachmentId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: "bad_attachment_id" }, 400);
  }

  // ── The row decides everything ─────────────────────────────────────────────
  type Row = { uploader_id: string | null; kind: string; mime: string; storage_path: string; status: string };
  let row: Row | null = null;
  try {
    const r = await fetch(
      `${url}/rest/v1/support_attachments?id=eq.${id}&select=uploader_id,kind,mime,storage_path,status`,
      { headers: REST(serviceKey) },
    );
    const rows = r.ok ? await r.json() : [];
    row = Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return json({ error: "lookup_failed" }, 502);
  }
  if (!row) return json({ error: "not_found" }, 404);
  if (row.uploader_id !== callerId) return json({ error: "forbidden" }, 403);
  if (row.status !== "pending") return json({ status: row.status });

  const objectUrl = `${url}/storage/v1/object/${BUCKET}/${row.storage_path}`;

  async function verdict(clean: boolean, reason?: string): Promise<Response> {
    const r = await fetch(`${url}/rest/v1/rpc/support_attachment_checked`, {
      method: "POST",
      headers: REST(serviceKey!),
      body: JSON.stringify({ p_attachment_id: id, p_clean: clean }),
    });
    if (!r.ok) return json({ error: "verdict_not_saved" }, 502);
    if (!clean) {
      // Best effort: the row already says "rejected", so nothing will ever serve it.
      await fetch(objectUrl, { method: "DELETE", headers: REST(serviceKey!) }).catch(() => undefined);
    }
    return json(clean ? { status: "clean" } : { status: "rejected", reason });
  }

  // ── Read the first bytes, and the size ─────────────────────────────────────
  let head: Uint8Array;
  let size: number;
  let served: string;
  try {
    const r = await fetch(objectUrl, { headers: { ...REST(serviceKey), range: "bytes=0-63" } });
    if (r.status === 404 || r.status === 400) {
      // Not uploaded yet: leave it pending, the client can ask again.
      return json({ status: "pending", reason: "not_uploaded" });
    }
    if (!r.ok) return json({ error: "download_failed", detail: String(r.status) }, 502);
    // The type storage will SERVE the file as, which is what the browser acts on. The
    // bucket only checks it is on the allowlist, so a file reserved as a PNG could be
    // uploaded as application/pdf with a PNG header and then render inline.
    served = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const total = /\/(\d+)$/.exec(r.headers.get("content-range") || "")?.[1];
    // A server that ignores Range sends the whole object; read what we need either way.
    const reader = r.body!.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    while (got < 64) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      got += value.length;
    }
    await reader.cancel().catch(() => undefined);
    head = new Uint8Array(got);
    let off = 0;
    for (const c of chunks) {
      head.set(c.subarray(0, Math.max(0, Math.min(c.length, got - off))), off);
      off += c.length;
    }
    size = total ? Number(total) : Number(r.headers.get("content-length") || got);
  } catch (e) {
    return json({ error: "download_failed", detail: String(e).slice(0, 200) }, 502);
  }

  if (!(size > 0) || size > (CAP[row.kind] ?? 0)) return verdict(false, "size");
  if (served !== row.mime.toLowerCase()) return verdict(false, "content_type");
  if (!signatureMatches(row.mime, head)) return verdict(false, "signature");
  return verdict(true);
});
