// Supabase Edge Function: account-deletion-sweep
//
// Step 4 of "Delete my account" (the My Profile brief; Phase 16 moved it here
// from a SQL-only cron job, 2026-09-24). pg_cron `account-deletion-sweep` posts
// to this function daily, the way `embedding-worker` drives generate-embedding.
// For each request whose 14-day cooling-off has ended it:
//   1. reads the account's avatar objects and avatar_url (account_deletion_sweep_list),
//      BEFORE anything is scrubbed;
//   2. anonymizes the account (complete_account_deletion: the same lock, re-check,
//      anonymize_account() and 'completed' as process_due_account_deletions());
//   3. only then deletes the account's avatar files through the Storage API, and
//      records the result (record_account_storage_cleanup).
//
// ORDER. The files go after the anonymization, not before. anonymize_account()
// can refuse (the account became a vendor during the 14 days, say), and a refused
// deletion must not cost the person their photo. A Storage failure never blocks
// the anonymization either: it is recorded on the request (storage_error) and
// the next run retries it, because account_deletion_sweep_list() also returns
// every completed request whose files are not confirmed gone.
//
// WHAT IS DELETED. Every object under `avatars/<user id>/`, the folder the
// avatars bucket's policies give each user. Uploads that were never saved, and
// earlier photos, are there too, not only the current avatar_url. Nothing
// outside that folder is ever touched: avatar_url is text the user can edit, so a
// URL pointing somewhere else (another bucket, another user's folder) is logged,
// never followed. RFQ and review images in product-images stay: they belong to
// records that are kept.
//
// Invoked by pg_cron through pg_net only. The handler requires a service_role
// JWT on top of the platform's verify_jwt gate (supabase/config.toml).
//
// Platform-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. No other secret.
//
// CONVENTIONS, as generate-embedding and account-deletion: no imports, raw
// Deno.serve + fetch against PostgREST and Storage with the service-role key.

const AVATAR_BUCKET = "avatars";

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

interface WorkRow {
  request_id: string;
  user_id: string;
  /** 'due': anonymize, then clean up. 'storage': already anonymized, files still to go. */
  phase: "due" | "storage";
  avatar_url: string | null;
  /** Object names in the avatars bucket under `<user_id>/`, read before anonymizing. */
  avatar_paths: string[];
}

// A URL into this project's Storage that is not in the account's own avatar
// folder is reported, never deleted.
function warnIfForeignAvatar(row: WorkRow): void {
  if (!row.avatar_url) return;
  let url: URL;
  try {
    url = new URL(row.avatar_url);
  } catch {
    return;
  }
  if (url.origin !== new URL(SUPABASE_URL).origin) return; // a Google picture or similar
  const own = `/storage/v1/object/public/${AVATAR_BUCKET}/${row.user_id}/`;
  if (!url.pathname.startsWith(own)) {
    console.warn(`[account-deletion-sweep] request ${row.request_id}: avatar_url points outside the account's avatar folder; not deleted`);
  }
}

// Deletes the account's avatar objects. Returns an error message, or null.
async function removeAvatars(row: WorkRow): Promise<string | null> {
  const paths = (row.avatar_paths ?? []).filter((p) => p.startsWith(`${row.user_id}/`));
  if (paths.length === 0) return null;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${AVATAR_BUCKET}`, {
    method: "DELETE",
    headers: serviceHeaders,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) return `storage delete ${res.status}: ${(await res.text()).slice(0, 200)}`;
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (jwtRole(req.headers.get("authorization")) !== "service_role") {
    return json({ error: "forbidden" }, 403);
  }

  const summary = { due: 0, completed: 0, not_completed: 0, storage_cleaned: 0, storage_pending: 0, errors: 0 };
  let rows: WorkRow[];
  try {
    rows = await rpc<WorkRow[]>("account_deletion_sweep_list", {});
  } catch (e) {
    console.error("[account-deletion-sweep] could not read the work list:", e);
    return json({ error: "list_failed" }, 500);
  }

  // One row's failure never stops the others: each is its own try.
  for (const row of rows) {
    try {
      if (row.phase === "due") {
        summary.due++;
        warnIfForeignAvatar(row);
        // Never raises. A refusal is recorded on the request (last_error) and
        // retried on the next run.
        const outcome = await rpc<string>("complete_account_deletion", { p_request: row.request_id });
        if (outcome !== "completed") {
          summary.not_completed++;
          console.warn(`[account-deletion-sweep] request ${row.request_id}: ${outcome}`);
          continue;
        }
        summary.completed++;
      }

      let storageError: string | null = null;
      try {
        storageError = await removeAvatars(row);
      } catch (e) {
        storageError = `storage delete threw: ${String(e).slice(0, 200)}`;
      }
      // The database re-lists the folder: 'cleaned' only when no object is left.
      const recorded = await rpc<string>("record_account_storage_cleanup", {
        p_request: row.request_id,
        p_error: storageError,
      });
      if (recorded === "cleaned") summary.storage_cleaned++;
      else {
        summary.storage_pending++;
        console.warn(`[account-deletion-sweep] request ${row.request_id}: avatar cleanup ${recorded}${storageError ? ` (${storageError})` : ""}`);
      }
    } catch (e) {
      summary.errors++;
      console.error(`[account-deletion-sweep] request ${row.request_id}:`, e);
    }
  }

  return json(summary);
});
