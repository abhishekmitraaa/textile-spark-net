-- RFQ → vendor semantic lead matching — the RFQ side (Phases 1 and 2).
--
-- Everything here rides on Master Prompt 1's pipeline rather than rebuilding it:
-- same halfvec(1536) dimension, same pgmq `embedding_jobs` queue, same pg_cron
-- poller, same generate-embedding edge function. Two RFQ-specific pieces are
-- genuinely new, and only two.
--
-- The first is set_rfq_embedding. The queue was designed to carry a `table`
-- discriminator from day one ({table, id, text}), but the worker only ever had
-- one writer wired to it — set_product_embedding — and its dispatch is an
-- equality test against the literal 'products'. A job tagged 'rfqs' therefore
-- lands in the worker's `unprocessable` bucket and is ARCHIVED UNEMBEDDED, so
-- adding the trigger below without also teaching the worker a second writer
-- would fail silently: jobs enqueued, jobs archived, embedding still null. The
-- edge function change is in the same commit as this migration.

alter table public.rfqs add column embedding extensions.halfvec(1536);

-- Same IMMUTABLE-wrapper reason as products.search_text: array_to_string() is
-- only STABLE, and a stored generated column requires an IMMUTABLE expression.
-- public.immutable_array_to_string was added in 20260906130000 for exactly this
-- and is reused rather than duplicated.
--
-- No `fts` twin here, deliberately. products has one because buyers run keyword
-- searches over the catalogue; nobody keyword-searches the RFQ pool, and an
-- unused GIN index is pure write cost.
alter table public.rfqs add column search_text text
generated always as (
  coalesce(title,'') || ' ' || coalesce(product_name,'') || ' ' ||
  coalesce(description,'') || ' ' ||
  coalesce(public.immutable_array_to_string(colors,' '),'') || ' ' ||
  coalesce(customization_notes,'')
) stored;

create index rfqs_embedding_idx on public.rfqs
  using hnsw (embedding extensions.halfvec_cosine_ops);

-- ── Enqueue ──
-- Byte-for-byte the products trigger's shape, for the same reason: an OpenAI
-- round-trip must never sit on the critical path of a buyer posting a
-- requirement. The empty-text guard is what makes "embedding is null" mean
-- "pipeline hasn't run yet" rather than "this row had nothing to embed".
create or replace function public.enqueue_rfq_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.search_text is null or length(trim(new.search_text)) = 0 then
    return null;
  end if;
  perform pgmq.send('embedding_jobs', jsonb_build_object(
    'table', 'rfqs', 'id', new.id, 'text', new.search_text));
  return null;
end $$;

-- category_id is NOT in this column list, unlike the products trigger. products
-- denormalises category_name into its search_text, so recategorising changes the
-- text; rfqs does not, so a category change cannot alter search_text and
-- re-embedding on it would spend an OpenAI call to produce the same vector.
drop trigger if exists trg_rfqs_enqueue_embedding on public.rfqs;
create trigger trg_rfqs_enqueue_embedding
after insert or update of title, product_name, description, colors, customization_notes
on public.rfqs
for each row execute function public.enqueue_rfq_embedding();

-- ── Worker write-back ──
-- Mirrors set_product_embedding exactly, including the reason it is an RPC and
-- not a PostgREST table update: the text -> halfvec cast stays explicit and
-- server-side instead of asking PostgREST to infer the type of a 1536-element
-- JSON array.
--
-- As with products, writing `embedding` cannot re-enqueue the job that produced
-- it: trg_rfqs_enqueue_embedding lists the text-bearing columns only.
create or replace function public.set_rfq_embedding(p_id uuid, p_embedding text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.rfqs
     set embedding = p_embedding::extensions.halfvec(1536)
   where id = p_id;
  return found;
end $$;

-- Postgres grants EXECUTE to PUBLIC on every new function; this codebase closes
-- that by hand on every SECURITY DEFINER it adds (20260801100327, 20260906200000).
revoke all on function public.enqueue_rfq_embedding()            from public, anon, authenticated;
revoke all on function public.set_rfq_embedding(uuid, text)      from public, anon, authenticated;
grant execute on function public.set_rfq_embedding(uuid, text)   to service_role;
