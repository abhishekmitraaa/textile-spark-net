// Supabase Edge Function: generate-embedding
//
// Drains the `embedding_jobs` pgmq queue. For each job it embeds the row's
// search_text with OpenAI text-embedding-3-small and writes the 1536-dim vector
// back to that row via a service-role RPC, then archives the message.
//
// The queue carries a `table` discriminator and this worker dispatches on it
// (see WRITERS). It handles three producers today — products (buyer catalogue
// search), rfqs (vendor lead matching) and product_videos (related-reel
// ranking) — and they share one queue, one cron poller and one OpenAI batch on
// purpose: a reel, an RFQ and a product listing are the same operation to this
// function, and splitting them would triple the invocation cost for no
// behavioural gain.
//
// Invoked by pg_cron through pg_net — see the schedule_embedding_worker
// migration. Nothing else should call it, which is why the handler requires a
// service_role JWT on top of the platform's verify_jwt gate.
//
// Required secret:      OPENAI_API_KEY
// Platform-provided:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Failure policy (deliberate): a message is archived ONLY after its row has
// actually been updated. Anything else — OpenAI down, billing not active, a bad
// response — leaves the message in-queue, and the visibility timeout hands it to
// the next cron tick. That is what makes the backfill self-healing: queue the
// jobs now, turn billing on later, and they drain with no operator action.

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
// Messages per invocation. One OpenAI call carries the whole batch, so this is
// bounded by request size, not by API round-trips.
//
// This is NOT the throughput ceiling any more. The cron dispatcher fires
// ceil(waiting / BATCH) concurrent invocations (capped at 10), so a backlog is
// drained by several workers in parallel rather than 20 jobs per minute. See
// the embedding_worker_adaptive_dispatch migration; pgmq's visibility timeout
// is what keeps those concurrent readers from claiming the same message, and
// that was demonstrated rather than assumed.
const BATCH = 20;
// Longer than any plausible embed+write cycle, so two overlapping cron ticks
// can't both claim the same message.
const VT_SECONDS = 90;

// text-embedding-3-small accepts 8192 tokens. 30k characters is a conservative
// floor for that (English averages well under 4 chars/token, and this is a
// safety valve, not a budget to spend).
//
// This matters because products.search_text concatenates products.description,
// which has NO length constraint — checked, the table carries no CHECK
// constraints at all. Live data maxes out at 97 characters today, so nothing
// is close. But ONE vendor pasting a 40k-character description would 400 the
// entire OpenAI call, and that call carries the whole batch of 20 — so a single
// oversized row would fail 19 innocent jobs alongside it, on every retry,
// forever. Truncating is lossless in practice: no useful embedding signal lives
// in the 30,001st character of a product description.
const MAX_CHARS = 30_000;

// After this many delivery attempts a message is archived instead of retried.
// pgmq has always tracked read_ct and nothing has ever looked at it, so a job
// that can never succeed — a malformed row, a text OpenAI rejects for a reason
// truncation doesn't fix — recycled indefinitely and took a slot in every batch
// it landed in. Archiving is the right disposal: pgmq's archive table is the
// dead-letter queue, the message is preserved for inspection rather than
// dropped, and the row simply keeps embedding = null, which the health check
// already reports as `products_missing`.
const MAX_ATTEMPTS = 5;

// Backoff for a rate-limited or failing OpenAI: 90s, 3m, 6m, 12m, capped at 1h.
// Applied to each message in the failed batch, keyed on its own read_ct.
const backoffSeconds = (readCt: number): number =>
  Math.min(VT_SECONDS * Math.pow(2, Math.max(readCt - 1, 0)), 3600);

// Queue `table` value -> the service-role RPC that writes the vector back.
// Adding another embeddable table is one line here plus a set_<table>_embedding
// function; nothing else in this file needs to know about it. A job naming a
// table absent from here is unprocessable by definition and gets archived
// rather than left to cycle forever.
const WRITERS: Record<string, string> = {
  products: "set_product_embedding",
  rfqs: "set_rfq_embedding",
  product_videos: "set_video_embedding",
};

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
// already validated the token before this handler runs — the same reasoning the
// bunny-* functions document.
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

interface Job {
  msg_id: number;
  read_ct: number;
  message: { table?: string; id?: string; text?: string } | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (jwtRole(req.headers.get("authorization")) !== "service_role") {
    return json({ error: "forbidden" }, 403);
  }

  let body: { probe?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is normal — the cron poller posts '{}'.
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");

  // Config verdict without touching the queue or spending a token. Mirrors the
  // bunny-config-check convention: reports secret NAMES, never values.
  if (body.probe) {
    return json({
      probe: true,
      model: MODEL,
      dimensions: DIMS,
      has_openai_key: Boolean(apiKey),
      has_service_key: Boolean(SERVICE_KEY),
      supabase_url_set: Boolean(SUPABASE_URL),
    });
  }

  if (!apiKey) return json({ error: "not_configured" }, 200);

  let jobs: Job[];
  try {
    jobs = await rpc<Job[]>("embedding_jobs_read", { batch_size: BATCH, vt: VT_SECONDS });
  } catch (e) {
    return json({ error: "queue_read_failed", detail: String(e) }, 200);
  }
  if (!jobs?.length) return json({ processed: 0, archived: 0, queue_empty: true });

  // A job naming a table this worker doesn't handle can never succeed, so it is
  // archived rather than left to cycle forever. Same for a job with no text,
  // and for one that has already burned through MAX_ATTEMPTS deliveries.
  const usable: { msg_id: number; id: string; text: string; writer: string; read_ct: number }[] = [];
  const unprocessable: number[] = [];
  const exhausted: { msg_id: number; id?: string; read_ct: number }[] = [];
  for (const j of jobs) {
    const m = j.message;
    const writer = m?.table ? WRITERS[m.table] : undefined;
    if (j.read_ct > MAX_ATTEMPTS) {
      // Poison message. Dead-letter it so it stops occupying a slot in every
      // batch and stops failing the 19 jobs it is batched with.
      exhausted.push({ msg_id: j.msg_id, id: m?.id, read_ct: j.read_ct });
    } else if (writer && typeof m?.id === "string" && m.text?.trim()) {
      usable.push({
        msg_id: j.msg_id,
        id: m.id,
        text: m.text.trim().slice(0, MAX_CHARS),
        writer,
        read_ct: j.read_ct,
      });
    } else {
      unprocessable.push(j.msg_id);
    }
  }

  let embeddings: number[][] = [];
  if (usable.length) {
    try {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, input: usable.map((u) => u.text), dimensions: DIMS }),
      });
      if (!resp.ok) {
        // Leave every message in-queue; the visibility timeout retries them.
        // On a rate limit or a server-side fault, push those retries out
        // exponentially instead of coming straight back in 90 seconds — a
        // fixed-cadence retry against a 429 is what keeps an account limited.
        // A 4xx that is NOT 429 is a request problem that waiting cannot fix,
        // so those keep the default timeout and burn through MAX_ATTEMPTS
        // instead of being backed off into invisibility.
        const detail = (await resp.text()).slice(0, 300);
        const shouldBackOff = resp.status === 429 || resp.status >= 500;
        if (shouldBackOff) {
          await Promise.all(
            usable.map((u) =>
              rpc("embedding_jobs_set_vt", {
                p_msg_id: u.msg_id,
                p_vt: backoffSeconds(u.read_ct),
              }).catch(() => {/* default VT still applies; next tick retries */}),
            ),
          );
        }
        return json(
          {
            error: "embed_failed",
            status: resp.status,
            detail,
            retrying: usable.length,
            backed_off: shouldBackOff,
            next_retry_seconds: shouldBackOff
              ? Math.max(...usable.map((u) => backoffSeconds(u.read_ct)))
              : VT_SECONDS,
          },
          200,
        );
      }
      const data = await resp.json();
      // Index is authoritative — do not assume the API preserved input order.
      const byIndex = new Map<number, number[]>();
      for (const d of data?.data ?? []) byIndex.set(d.index, d.embedding);
      embeddings = usable.map((_, i) => byIndex.get(i) ?? []);
    } catch (e) {
      return json({ error: "embed_request_failed", detail: String(e), retrying: usable.length }, 200);
    }
  }

  let archived = 0;
  const failed: { id: string; reason: string }[] = [];

  for (let i = 0; i < usable.length; i++) {
    const vec = embeddings[i];
    if (!vec?.length || vec.length !== DIMS) {
      failed.push({ id: usable[i].id, reason: `bad_vector_len_${vec?.length ?? 0}` });
      continue; // stays queued
    }
    try {
      const wrote = await rpc<boolean>(usable[i].writer, {
        p_id: usable[i].id,
        p_embedding: JSON.stringify(vec),
      });
      if (!wrote) {
        // Row is gone (deleted between enqueue and now). Retrying can't fix it.
        await rpc("embedding_jobs_archive", { p_msg_id: usable[i].msg_id });
        archived++;
        continue;
      }
      await rpc("embedding_jobs_archive", { p_msg_id: usable[i].msg_id });
      archived++;
    } catch (e) {
      failed.push({ id: usable[i].id, reason: String(e).slice(0, 120) });
    }
  }

  for (const msgId of unprocessable) {
    try {
      await rpc("embedding_jobs_archive", { p_msg_id: msgId });
      archived++;
    } catch { /* leave it; next tick retries */ }
  }

  for (const e of exhausted) {
    try {
      await rpc("embedding_jobs_archive", { p_msg_id: e.msg_id });
      archived++;
    } catch { /* leave it; next tick retries */ }
  }

  return json({
    processed: usable.length,
    archived,
    unprocessable: unprocessable.length,
    // Surfaced separately from `unprocessable` because they mean different
    // things: unprocessable is a malformed job, exhausted is a job that looked
    // fine and kept failing. A non-zero count here is a signal to go and look
    // at the archive table, not routine.
    exhausted: exhausted.length,
    exhausted_ids: exhausted.map((e) => e.id).filter(Boolean),
    failed,
  });
});
