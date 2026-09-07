-- Video content embeddings for related-reel ranking — Phases 1 and 2.
--
-- SCOPE, HONESTLY: product_videos holds ONE live row today. This migration is
-- pure infrastructure and changes nothing a buyer can see. It is worth doing
-- now because it is cheap, one-time, and rides entirely on Master Prompt 1's
-- pipeline — same halfvec(1536) dimension, same pgmq `embedding_jobs` queue,
-- same pg_cron poller, same generate-embedding edge function. It is NOT worth
-- mistaking for a shipped feature: see 20260907150100_match_videos for the
-- volume threshold below which "similar reels" has nothing to say.
--
-- What is genuinely new is set_video_embedding, and the same trap applies as
-- when rfqs was added: the worker dispatches on the queue's `table`
-- discriminator through a WRITERS map, and a job naming a table absent from
-- that map is ARCHIVED UNEMBEDDED. Adding the trigger below without teaching
-- the worker a third writer would fail silently — jobs enqueued, jobs archived,
-- embedding still null. The edge function change ships in the same commit.

alter table public.product_videos add column embedding extensions.halfvec(1536);

-- ── Search text ──
-- Unlike products.search_text and rfqs.search_text this CANNOT be a generated
-- column: the text depends on the linked product's row, and a generated column
-- may not run a subquery. So it is a function, evaluated by the trigger at
-- enqueue time, and the text lives only in the queue message.
--
-- The parameter is the table's composite type, not `record`. `record` is not a
-- legal argument type for a SQL-language function; the rowtype is, and plpgsql
-- binds NEW to it directly with no cast (verified against this database).
--
-- Two branches, preferring the linked listing. A reel tagged to a real product
-- inherits that listing's fabric / fit / colour / description; an untagged reel
-- has only its own two sparse fields to offer.
--
-- The product branch reads products.search_text rather than re-deriving a
-- concatenation of name/description/fabric/gsm, for three reasons:
--   * It is the maintained superset. search_text already carries fit_type,
--     colour, pattern, occasion, neck/sleeve/collar type and category_name on
--     top of those four. Re-deriving a subset would omit precisely the "fit"
--     signal this feature is supposed to gain from the link.
--   * It is the exact string the product itself embeds from, so a tagged reel
--     lands next to its own listing in vector space instead of near-but-not-
--     quite it. That is what makes "more like this reel" and "you might also
--     like" agree with each other.
--   * One definition, not two. A column added to search_text later reaches the
--     reels automatically; a hand-rolled copy here would silently drift.
--
-- nullif(trim(...), '') on BOTH branches, not a bare coalesce, and this is
-- load-bearing rather than defensive. products.search_text is a concatenation
-- of coalesce()s, so it is never NULL — for a product with no text at all it is
-- a string of spaces. A bare coalesce would therefore return that whitespace,
-- the trigger's empty-text guard would reject it, and the video would silently
-- never embed even though its own category/brand_line were perfectly usable.
-- nullif is what lets a threadbare product fall THROUGH to the video's fields.
--
-- SECURITY INVOKER deliberately: the only caller is the SECURITY DEFINER
-- trigger below, which already holds the privilege needed to read products, so
-- this needs none of its own. Making it DEFINER would turn it into an RPC that
-- returns any product's search_text regardless of RLS.
create or replace function public.build_video_search_text(v public.product_videos)
returns text
language sql
stable
set search_path = pg_catalog, public
as $fn$
  select coalesce(
    nullif(trim((select p.search_text from public.products p where p.id = v.product_id)), ''),
    nullif(trim(coalesce(v.category, '') || ' ' || coalesce(v.brand_line, '')), '')
  );
$fn$;

comment on function public.build_video_search_text(public.product_videos) is
  'Embedding input for a reel: the linked product search_text when it has one, else the video own category + brand_line. Takes the table rowtype so a trigger can pass NEW directly.';

-- No `fts` twin and no trigram index, matching the rfqs decision: nobody
-- keyword-searches the reel feed, and an unused GIN index is pure write cost.
create index product_videos_embedding_idx on public.product_videos
  using hnsw (embedding extensions.halfvec_cosine_ops);

-- ── Enqueue ──
-- Same shape as the products and rfqs triggers, plus one filter they don't
-- have: status = 'live'. A reel sitting in moderation may never be approved,
-- and embedding it would spend an OpenAI call on content no buyer will see.
-- Because status is in the trigger's column list, approval itself is what
-- enqueues the job — the reel embeds at the moment it becomes visible.
create or replace function public.enqueue_video_embedding()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_text text;
begin
  if new.status::text <> 'live' then
    return null;
  end if;
  v_text := public.build_video_search_text(new);
  -- Keeps "embedding is null" meaning "pipeline hasn't run yet" rather than
  -- "this row had nothing to embed", the same invariant Phase 5 checks against.
  if v_text is null or length(trim(v_text)) = 0 then
    return null;
  end if;
  perform pgmq.send('embedding_jobs', jsonb_build_object(
    'table', 'product_videos', 'id', new.id, 'text', v_text));
  return null;
end $fn$;

-- product_id is in the column list because re-tagging a reel to a different
-- listing changes which product's search_text it inherits — unlike rfqs, where
-- category_id was deliberately left out precisely because it could not change
-- the text.
--
-- KNOWN GAP, recorded rather than fixed: editing the LINKED PRODUCT's text does
-- not re-enqueue the video, because nothing writes to the product_videos row.
-- Closing it would need a products -> product_videos cascade in the shape of
-- cascade_category_rename. That is not built here — with one live reel it would
-- add a fan-out to every product edit to keep zero rows fresh. Revisit when
-- reel volume makes it matter.
drop trigger if exists trg_product_videos_enqueue_embedding on public.product_videos;
create trigger trg_product_videos_enqueue_embedding
after insert or update of category, brand_line, product_id, status
on public.product_videos
for each row execute function public.enqueue_video_embedding();

-- ── Worker write-back ──
-- Mirrors set_product_embedding and set_rfq_embedding exactly, including why it
-- is an RPC rather than a PostgREST table update: the text -> halfvec cast stays
-- explicit and server-side instead of asking PostgREST to infer the type of a
-- 1536-element JSON array.
--
-- Writing `embedding` cannot re-enqueue the job that produced it: the trigger
-- above lists the text-bearing columns and status only.
create or replace function public.set_video_embedding(p_id uuid, p_embedding text)
returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  update public.product_videos
     set embedding = p_embedding::extensions.halfvec(1536)
   where id = p_id;
  return found;
end $fn$;

-- Postgres grants EXECUTE to PUBLIC on every new function; this codebase closes
-- that by hand on every function it adds (20260801100327, 20260906200000).
revoke all on function public.build_video_search_text(public.product_videos) from public, anon, authenticated;
revoke all on function public.enqueue_video_embedding()                      from public, anon, authenticated;
revoke all on function public.set_video_embedding(uuid, text)                from public, anon, authenticated;
grant execute on function public.set_video_embedding(uuid, text)             to service_role;
