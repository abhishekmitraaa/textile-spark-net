-- Move recompute_vendor_catalog_embedding off the synchronous product write path.
--
-- ── The measurement that forced this ───────────────────────────────────────
-- 20260907120100_vendor_catalog_embedding.sql said this was fine "at this
-- volume" (30 products, 7 vendors) and named the trigger to watch for: "a
-- vendor ever carries thousands of live listings". Measured, on vendors carrying
-- ~1,000 synthetic live listings:
--
--   live listings   recompute_vendor_catalog_embedding()
--   1,044           1,364.7 ms
--   1,032           1,096.4 ms
--   1,021             453.0 ms   (warm cache)
--
-- That is 0.45-1.4 SECONDS added to every single product INSERT or UPDATE for
-- that vendor, executed inside the vendor's own transaction — their "save
-- listing" request blocks on it. It is an AFTER trigger, so it also holds the
-- row lock for the duration.
--
-- The bulk-import case is worse than linear. Importing N listings fires the
-- trigger N times, and each run averages over a catalogue that has grown by
-- one, so the total is O(N^2) vector reads. A 500-product import for a vendor
-- already holding ~1,000 listings costs roughly 500 x 1s = ~8 minutes of pure
-- trigger overhead, on top of the import itself.
--
-- ── The shape of the fix ───────────────────────────────────────────────────
-- Enqueue, don't compute. The trigger becomes a single-row upsert into a queue
-- table and returns immediately; a cron job drains it.
--
-- A TABLE keyed on vendor_id, not pgmq. Dedupe is the entire point here and it
-- falls out of the primary key: 500 product writes for one vendor collapse into
-- ONE queue row, so the drain does one recompute instead of 500. pgmq has no
-- dedupe primitive and would have queued 500 messages that each did the same
-- full-catalogue average. That is also why this does not reuse embedding_jobs.
--
-- `on conflict do update set queued_at = now()` rather than `do nothing`: if a
-- vendor is being written to continuously we want the recompute to reflect the
-- latest state, and refreshing the timestamp lets the drainer prefer the
-- longest-waiting vendor rather than starving one that keeps getting touched.
--
-- ── The cost of doing it this way ──────────────────────────────────────────
-- vendor_profiles.catalog_embedding is now eventually consistent, lagging a
-- product write by up to one cron tick (60s) plus drain time. That is
-- acceptable because of what it feeds: catalog_embedding is read ONLY by the
-- RFQ<->vendor matching functions. A vendor's own listings appear in buyer
-- search immediately (that is products.embedding, a different column on a
-- different path). The visible effect of the lag is that a brand-new listing
-- influences which RFQs are suggested to that vendor a minute later than it
-- used to. Nobody is waiting on that.
--
-- DELETE and vendor-reassignment still enqueue both sides, exactly as the
-- synchronous version recomputed both.

-- ── 1. The queue ───────────────────────────────────────────────────────────
create table if not exists public.vendor_catalog_recompute_queue (
  vendor_id  uuid primary key references public.vendor_profiles(id) on delete cascade,
  queued_at  timestamptz not null default now()
);

comment on table public.vendor_catalog_recompute_queue is
  'Vendors whose catalog_embedding needs recomputing. Keyed on vendor_id so repeated product writes for one vendor collapse to a single pending row — that dedupe is why this is a table and not a pgmq queue. Drained by the vendor-catalog-recompute cron job.';

create index if not exists vendor_catalog_recompute_queue_queued_at_idx
  on public.vendor_catalog_recompute_queue (queued_at);

-- Internal plumbing. No client ever reads or writes this: RLS on with no
-- policies denies everything to anon/authenticated, and the trigger + drainer
-- reach it through SECURITY DEFINER.
alter table public.vendor_catalog_recompute_queue enable row level security;
revoke all on public.vendor_catalog_recompute_queue from public, anon, authenticated;
grant select, insert, update, delete on public.vendor_catalog_recompute_queue to service_role;

-- ── 2. The trigger now enqueues ────────────────────────────────────────────
create or replace function public.sync_vendor_catalog_embedding()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if tg_op = 'DELETE' then
    insert into public.vendor_catalog_recompute_queue (vendor_id)
    values (old.vendor_id)
    on conflict (vendor_id) do update set queued_at = now();
    return null;
  end if;

  insert into public.vendor_catalog_recompute_queue (vendor_id)
  values (new.vendor_id)
  on conflict (vendor_id) do update set queued_at = now();

  -- A listing reassigned to a different vendor invalidates BOTH catalogs.
  if tg_op = 'UPDATE' and old.vendor_id is distinct from new.vendor_id then
    insert into public.vendor_catalog_recompute_queue (vendor_id)
    values (old.vendor_id)
    on conflict (vendor_id) do update set queued_at = now();
  end if;

  return null;
end
$function$;

comment on function public.sync_vendor_catalog_embedding() is
  'Product-write trigger: enqueues the affected vendor(s) for catalog_embedding recompute. Deliberately does NOT recompute inline — that cost 0.45-1.4s per write at ~1,000 listings and was O(N^2) on bulk import.';

-- ── 3. The drainer ─────────────────────────────────────────────────────────
create or replace function public.drain_vendor_catalog_recompute(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_done integer := 0;
  v_row  record;
begin
  -- Longest-waiting first, so a vendor being written to continuously cannot
  -- starve one that has been waiting. SKIP LOCKED keeps two overlapping drains
  -- from doing the same vendor twice; the DELETE ... RETURNING claims the rows
  -- in the same statement that removes them, so a crash mid-drain re-queues
  -- nothing that was already finished and loses nothing that was not.
  for v_row in
    delete from public.vendor_catalog_recompute_queue q
    where q.vendor_id in (
      select vendor_id from public.vendor_catalog_recompute_queue
      order by queued_at
      limit greatest(coalesce(p_limit, 50), 1)
      for update skip locked
    )
    returning q.vendor_id
  loop
    perform public.recompute_vendor_catalog_embedding(v_row.vendor_id);
    v_done := v_done + 1;
  end loop;

  return v_done;
end
$function$;

comment on function public.drain_vendor_catalog_recompute(integer) is
  'Recomputes catalog_embedding for up to p_limit queued vendors, longest-waiting first. Called by the vendor-catalog-recompute cron job. service_role only.';

revoke execute on function public.drain_vendor_catalog_recompute(integer) from public, anon, authenticated;
grant execute on function public.drain_vendor_catalog_recompute(integer) to service_role;

-- ── 4. Schedule it ─────────────────────────────────────────────────────────
-- Runs in-database (plain SQL, no pg_net hop) because there is no external
-- service to call — unlike the embedding worker, which must reach OpenAI.
select cron.unschedule('vendor-catalog-recompute')
where exists (select 1 from cron.job where jobname = 'vendor-catalog-recompute');

select cron.schedule(
  'vendor-catalog-recompute',
  '* * * * *',
  $job$ select public.drain_vendor_catalog_recompute(50); $job$
);
