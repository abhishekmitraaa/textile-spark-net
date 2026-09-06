-- Queue access for the generate-embedding edge function (Phase 2).
--
-- PostgREST only exposes `public` and `graphql_public`, so the edge function
-- cannot call pgmq.* directly. Rather than widen the exposed schema list — which
-- would put the entire queue API on the wire for every key — these three
-- SECURITY DEFINER wrappers expose exactly the three operations the worker needs
-- and nothing else. All are service_role-only.

create or replace function public.embedding_jobs_read(batch_size int default 10, vt int default 60)
returns table (msg_id bigint, read_ct int, message jsonb)
language sql security definer set search_path = public as $$
  select msg_id, read_ct, message from pgmq.read('embedding_jobs', vt, batch_size);
$$;

create or replace function public.embedding_jobs_archive(p_msg_id bigint)
returns boolean
language sql security definer set search_path = public as $$
  select pgmq.archive('embedding_jobs', p_msg_id);
$$;

-- The embedding write goes through an RPC rather than a PostgREST table update
-- so the text -> halfvec cast is explicit and server-side, instead of relying on
-- PostgREST inferring the type of a 1536-element JSON array.
--
-- Note this deliberately does NOT fire trg_products_enqueue_embedding: that
-- trigger lists the text-bearing columns only, so writing `embedding` cannot
-- re-enqueue the job that produced it. Without that, every successful embedding
-- would enqueue another one, forever.
create or replace function public.set_product_embedding(p_id uuid, p_embedding text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.products
     set embedding = p_embedding::extensions.halfvec(1536)
   where id = p_id;
  return found;
end $$;

revoke all on function public.embedding_jobs_read(int, int)          from public, anon, authenticated;
revoke all on function public.embedding_jobs_archive(bigint)         from public, anon, authenticated;
revoke all on function public.set_product_embedding(uuid, text)      from public, anon, authenticated;

grant execute on function public.embedding_jobs_read(int, int)       to service_role;
grant execute on function public.embedding_jobs_archive(bigint)      to service_role;
grant execute on function public.set_product_embedding(uuid, text)   to service_role;
