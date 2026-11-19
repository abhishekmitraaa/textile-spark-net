-- Medium bugs batch 1 (2026-11-19; plan documentation/medium-bugs-batch1-plan-2026-11-19.md).
--
-- 1. M-08 (Mitra: "Save it"): Following's Hide is a saved mute. follows.hidden_at; the buyer still follows (the
--    seller keeps the follower), the brand's listings leave the Following feed, View All offers Unhide.
--    A browser may update hidden_at only: UPDATE is granted on that one column.
-- 2. M-16 (Mitra: "Build saved sellers"): saved_vendors, a buyer's saved sellers (My Saves › Sellers), apart from
--    follows. Own rows only; written rows carry account_not_deleted; anonymize_account() deletes them.
-- 3. M-26 / M-09: my_followed_brands(), the caller's followed sellers with their live listing counts, seal parts and
--    the hidden flag, in one set-based query. Following used to download every live listing of every followed
--    seller to count them (PostgREST stops at 1,000).
-- 4. M-38: for_you_products searched only 40 HNSW candidates (hnsw.ef_search's default), so asking for 200 returned
--    at most ~40 once the index was used. It now searches 200, strictly in order, and keeps scanning past rows the
--    `status = 'live'` filter drops (pgvector 0.8 iterative scan).

-- ── 1. Hidden follows ────────────────────────────────────────────────────────
alter table public.follows add column if not exists hidden_at timestamptz;

revoke update on public.follows from anon, authenticated;
grant update (hidden_at) on public.follows to authenticated;

-- ── 2. Saved sellers ─────────────────────────────────────────────────────────
create table if not exists public.saved_vendors (
  buyer_id   uuid not null references public.profiles(id) on delete cascade,
  vendor_id  uuid not null references public.vendor_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, vendor_id),
  constraint saved_vendors_not_self check (buyer_id <> vendor_id)
);
create index if not exists saved_vendors_vendor_idx on public.saved_vendors (vendor_id);

alter table public.saved_vendors enable row level security;

drop policy if exists saved_vendors_select on public.saved_vendors;
create policy saved_vendors_select on public.saved_vendors
  for select to authenticated
  using (buyer_id = (select auth.uid()));

drop policy if exists saved_vendors_insert on public.saved_vendors;
create policy saved_vendors_insert on public.saved_vendors
  for insert to authenticated
  with check (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

drop policy if exists saved_vendors_delete on public.saved_vendors;
create policy saved_vendors_delete on public.saved_vendors
  for delete to authenticated
  using (buyer_id = (select auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

revoke all on public.saved_vendors from anon, authenticated;
grant select, insert, delete on public.saved_vendors to authenticated;

-- A deleted account's saved sellers go with its other private activity (claude.md: account deletion).
do $$
declare
  d text := pg_get_functiondef('public.anonymize_account(uuid)'::regprocedure);
  anchor text := 'delete from public.follows         where follower_id = p_user;';
begin
  if position('public.saved_vendors' in d) = 0 then
    if position(anchor in d) = 0 then
      raise exception 'anonymize_account: anchor line not found; add saved_vendors by hand';
    end if;
    execute replace(d, anchor, anchor || E'\n  delete from public.saved_vendors   where buyer_id    = p_user;');
  end if;
end $$;

-- ── 3. The caller's followed sellers ─────────────────────────────────────────
create or replace function public.my_followed_brands()
returns table (
  vendor_id uuid, brand_name text, city text, logo_url text, followers_count integer, live_count integer,
  is_verified boolean, plan_id text, plan_expires_at timestamptz, ad_verified_until timestamptz,
  hidden boolean, followed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select f.vendor_id, f.hidden_at, f.created_at
      from public.follows f
     where f.follower_id = (select auth.uid())
       and f.vendor_id <> (select auth.uid())
     order by f.created_at desc
     limit 2000
  ),
  live as (
    select p.vendor_id, count(*)::integer as n
      from public.products p
     where p.status = 'live'
       and p.vendor_id in (select m.vendor_id from mine m)
     group by p.vendor_id
  )
  select v.id, v.brand_name, v.city, v.logo_url, coalesce(v.followers_count, 0)::integer,
         coalesce(l.n, 0), coalesce(v.is_verified, false), v.plan_id::text, v.plan_expires_at, v.ad_verified_until,
         m.hidden_at is not null, m.created_at
    from mine m
    join public.vendor_profiles v on v.id = m.vendor_id
    left join live l on l.vendor_id = m.vendor_id
   order by m.created_at desc;
$$;

revoke all on function public.my_followed_brands() from public, anon;
grant execute on function public.my_followed_brands() to authenticated;

-- ── 4. For You searches 200 candidates ───────────────────────────────────────
-- A vector value first loads pgvector in this session, so its settings are known (USERSET) and not placeholders that
-- only a superuser may set.
select '[1]'::extensions.vector;
alter function public.for_you_products(uuid, integer) set hnsw.ef_search = '200';
alter function public.for_you_products(uuid, integer) set hnsw.iterative_scan = 'strict_order';

-- ── Self-check ───────────────────────────────────────────────────────────────
do $$
begin
  if position('public.saved_vendors' in pg_get_functiondef('public.anonymize_account(uuid)'::regprocedure)) = 0 then
    raise exception 'self-check: anonymize_account does not delete saved_vendors';
  end if;
  if has_column_privilege('authenticated', 'public.follows', 'vendor_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.follows', 'hidden_at', 'UPDATE') then
    raise exception 'self-check: follows UPDATE must be hidden_at only';
  end if;
  if has_table_privilege('anon', 'public.saved_vendors', 'SELECT')
     or has_function_privilege('anon', 'public.my_followed_brands()', 'EXECUTE') then
    raise exception 'self-check: anon reaches saved sellers or followed brands';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.for_you_products(uuid,integer)'::regprocedure
                  and proconfig @> array['hnsw.ef_search=200']) then
    raise exception 'self-check: for_you_products ef_search not set';
  end if;
end $$;
