-- ─────────────────────────────────────────────────────────────────────────────
-- The demand counters can't be pumped (2026-10-17)
--
-- Since 20261017150000 ranking runs on real demand (enquiries_count * 10 + views_count). The commit security review
-- pointed out what that invites: increment_product_enquiry added 1 on every call from anyone, signed out included
-- (PUBLIC/anon EXECUTE), so a loop could push any listing to the top of "trending", the spotlight and featured
-- places, at ten points a call; and a views loop with made-up browser keys could do the same more slowly.
--
-- increment_product_enquiry(p): signed-in callers only (the app counts an enquiry when a signed-in buyer opens a
--   chat from the listing), once per account, listing and day (product_enquiry_daily), never the listing's own
--   seller. EXECUTE for authenticated only.
-- increment_product_view(p, p_viewer): never the listing's own seller; views from signed-out browsers count at
--   most 100 per listing per day (a signed-in account still counts once a day each), so made-up keys can't
--   outrun real traffic. The rest is 20261017110000's body.
-- Old rows of both ledgers go as before (about one call in 500).
--
-- What remains: many accounts can still each add one a day; accounts are cheap while the test sign-in code is on
-- (securityflags D-14 row). Logged.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.product_enquiry_daily (
  product_id uuid not null references public.products (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  day        date not null default (now() at time zone 'Asia/Kolkata')::date,
  primary key (product_id, profile_id, day)
);
alter table public.product_enquiry_daily enable row level security;
revoke all on public.product_enquiry_daily from public, anon, authenticated;
create index if not exists product_enquiry_daily_day_idx on public.product_enquiry_daily (day);

create or replace function public.increment_product_enquiry(p uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid  uuid := auth.uid();
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if p is null or v_uid is null then
    return;
  end if;
  if not exists (select 1 from public.products x where x.id = p and x.status = 'live' and x.vendor_id <> v_uid) then
    return;
  end if;
  insert into public.product_enquiry_daily (product_id, profile_id, day) values (p, v_uid, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.products set enquiries_count = enquiries_count + 1 where id = p and status = 'live';
  end if;
  if random() < 0.002 then
    delete from public.product_enquiry_daily d where d.day < v_day - 1;
  end if;
end
$function$;
revoke all on function public.increment_product_enquiry(uuid) from public, anon;
grant execute on function public.increment_product_enquiry(uuid) to authenticated;

create or replace function public.increment_product_view(p uuid, p_viewer text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows integer;
begin
  if p is null then
    return;
  end if;
  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
  elsif p_viewer ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := 'b:' || p_viewer;
  else
    v_key := 'unkeyed';
  end if;

  -- A live listing, not the caller's own.
  if not exists (select 1 from public.products x
                  where x.id = p and x.status = 'live' and (v_uid is null or x.vendor_id <> v_uid)) then
    return;
  end if;
  -- Signed-out views: at most 100 per listing per day (2026-10-17, ranking reads this counter).
  if v_uid is null and (select count(*) from public.product_view_daily d
                         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
    return;
  end if;

  insert into public.product_view_daily (product_id, viewer_key, day)
  values (p, v_key, v_day)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.products set views_count = views_count + 1 where id = p and status = 'live';
  end if;

  if random() < 0.002 then
    delete from public.product_view_daily d where d.day < v_day - 1;
  end if;
end
$function$;

-- Self-checks
do $$
begin
  if has_function_privilege('anon', 'public.increment_product_enquiry(uuid)', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = 'public.increment_product_enquiry(uuid)'::regprocedure and a.grantee = 0) then
    raise exception 'self-check: signed-out callers can still count enquiries';
  end if;
  if not has_function_privilege('authenticated', 'public.increment_product_enquiry(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.increment_product_view(uuid, text)', 'execute') then
    raise exception 'self-check: the app lost a counter';
  end if;
  if has_table_privilege('authenticated', 'public.product_enquiry_daily', 'select') then
    raise exception 'self-check: the enquiry ledger is readable';
  end if;
end $$;
