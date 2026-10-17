-- ─────────────────────────────────────────────────────────────────────────────
-- The signed-out view cap holds under parallel calls (2026-10-17)
--
-- 20261017160000 counts signed-out views at most 100 per listing and day, by counting the day's rows and then
-- inserting. The commit security review pointed out the race: many calls at the same instant each see fewer than
-- 100 and all insert, so a burst can overshoot the cap. Signed-out calls for one listing now take a transaction
-- lock on that listing first (pg_advisory_xact_lock, keyed by the listing), so the count and the insert happen one
-- caller at a time per listing; other listings and signed-in viewers are not held up. The rest is 160000's body.
-- (Enquiries have no such race: their once-a-day rule is the ledger's primary key.)
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Signed-out views: at most 100 per listing per day, counted one caller at a time per listing.
  if v_uid is null then
    perform pg_advisory_xact_lock(hashtextextended('cosora.product_view_cap:' || p::text, 0));
    if (select count(*) from public.product_view_daily d
         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
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

do $$
begin
  if pg_get_functiondef('public.increment_product_view(uuid,text)'::regprocedure) !~ 'pg_advisory_xact_lock' then
    raise exception 'self-check: the view cap is not serialised';
  end if;
  if not has_function_privilege('anon', 'public.increment_product_view(uuid, text)', 'execute') then
    raise exception 'self-check: visitors lost the view counter';
  end if;
end $$;
