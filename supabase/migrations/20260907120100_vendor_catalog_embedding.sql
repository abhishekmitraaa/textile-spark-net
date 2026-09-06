-- Vendor catalog vector: the centroid of what a vendor actually sells (Phase 3).
--
-- This is the one piece of this feature that is not a copy of Master Prompt 1's
-- pattern. A vendor is represented by the MEAN of their own live products'
-- embeddings rather than by a separate embedding of their brand_name/about text,
-- because the product embeddings already are the most accurate statement of
-- "what this vendor sells" — and re-embedding marketing copy would mostly
-- measure how well a vendor writes about themselves.
--
-- The mean of unit-norm vectors is not itself unit-norm, which does not matter:
-- cosine distance (<=>) normalises both operands, so only the centroid's
-- DIRECTION is read. A vendor with one live product gets that product's vector
-- verbatim, which is the right answer, not a degenerate case.

alter table public.vendor_profiles add column catalog_embedding extensions.halfvec(1536);
alter table public.vendor_profiles add column catalog_embedding_updated_at timestamptz;

create index vendor_profiles_catalog_embedding_idx on public.vendor_profiles
  using hnsw (catalog_embedding extensions.halfvec_cosine_ops);

-- search_path MUST include extensions: pgvector's avg(halfvec) aggregate and the
-- halfvec type both live there, and a SECURITY DEFINER function pinned to public
-- alone cannot resolve either. (Same trap documented on match_products.)
--
-- catalog_embedding_updated_at is stamped even when the subquery returns NULL.
-- That is deliberate: it makes "recomputed, and this vendor genuinely has no
-- embedded live products" distinguishable from "never recomputed", which is the
-- difference between a working pipeline and a broken one when reading the table.
create or replace function public.recompute_vendor_catalog_embedding(v_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.vendor_profiles
     set catalog_embedding = (
           select avg(p.embedding)
           from public.products p
           where p.vendor_id = v_id
             and p.status = 'live'
             and p.embedding is not null
         ),
         catalog_embedding_updated_at = now()
   where id = v_id;
$$;

-- Synchronous on purpose. At this volume (30 products, 7 vendors) a recompute is
-- an aggregate over single-digit rows, and the queue-plus-cron machinery a
-- debounced version would need costs more than it saves. If a vendor ever
-- carries thousands of live listings this becomes a hot path on every embedding
-- write-back and should move to a pgmq job — that is the trigger to watch for,
-- not a reason to build it now.
create or replace function public.sync_vendor_catalog_embedding()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_vendor_catalog_embedding(old.vendor_id);
    return null;
  end if;
  perform public.recompute_vendor_catalog_embedding(new.vendor_id);
  -- A listing reassigned to a different vendor invalidates BOTH catalogs.
  if tg_op = 'UPDATE' and old.vendor_id is distinct from new.vendor_id then
    perform public.recompute_vendor_catalog_embedding(old.vendor_id);
  end if;
  return null;
end $$;

-- vendor_id is in the column list only so the reassignment branch above is
-- actually reachable: UPDATE ... OF fires on the columns NAMED in the statement,
-- so a bare `update products set vendor_id = ...` would otherwise never call this.
drop trigger if exists trg_products_sync_vendor_catalog on public.products;
create trigger trg_products_sync_vendor_catalog
after insert or update of embedding, status, vendor_id or delete
on public.products
for each row execute function public.sync_vendor_catalog_embedding();

revoke all on function public.sync_vendor_catalog_embedding()               from public, anon, authenticated;
revoke all on function public.recompute_vendor_catalog_embedding(uuid)      from public, anon, authenticated;
grant execute on function public.recompute_vendor_catalog_embedding(uuid)   to service_role;

-- Seed every existing vendor. Right now this writes NULL for all of them —
-- products.embedding is null across the board because the Prompt 1 pipeline has
-- never had an OPENAI_API_KEY to run with — and that is the correct, honest
-- state rather than a failure: the trigger above fills each vendor in the moment
-- their first product embedding is written back.
select public.recompute_vendor_catalog_embedding(id) from public.vendor_profiles;
