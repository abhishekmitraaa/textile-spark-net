-- A view of a listing deleted before the minute's fold stopped every view from being counted (found 2026-11-21 by the
-- local views spec). admin.product_views_fold() takes the whole queue in one statement and passes each listing to
-- add_listing_demand(); for a listing that no longer exists that insert into product_trend breaks its foreign key, the
-- statement fails, nothing leaves the queue, and the job fails the same way every minute after. Production's queue was
-- empty and its runs succeeding when this was found: it hadn't happened there yet.
--
-- Views of a listing that no longer exists still leave the queue; they are just not counted. Everything else is as it
-- was (20261120100000, review M-35).

begin;

create or replace function admin.product_views_fold()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_rows integer;
  v_day  date := (now() at time zone 'Asia/Kolkata')::date;
begin
  -- One fold at a time.
  if not pg_try_advisory_xact_lock(hashtext('admin.product_views_fold')) then
    return 0;
  end if;
  -- One statement, as admin.ad_impressions_fold(): the rows deleted are exactly the rows counted (a view that commits
  -- while the fold runs waits for the next one; code review of batch 4).
  with taken as (
    delete from admin.product_view_queue q where q.id <= (select max(id) from admin.product_view_queue)
    returning q.product_id, q.weight, q.vendor_id, q.viewer_id, q.at
  ), per_product as (
    -- Only listings that still exist: a view of one deleted since is taken off the queue and not counted.
    select t.product_id, count(*)::integer as n, sum(t.weight) as weight, max(t.at) as at
      from taken t
      join public.products p on p.id = t.product_id
     group by t.product_id
  ), counted as (
    update public.products x set views_count = x.views_count + pp.n
      from per_product pp where x.id = pp.product_id
    returning x.id
  ), viewers as (
    insert into admin.seller_viewer_daily (vendor_id, viewer_id, day)
    select distinct t.vendor_id, t.viewer_id, (t.at at time zone 'Asia/Kolkata')::date
      from taken t
     where t.viewer_id is not null and t.vendor_id is not null
       and exists (select 1 from public.vendor_profiles v where v.id = t.vendor_id)
    on conflict do nothing
    returning 1
  ), demand as (
    select public.add_listing_demand(pp.product_id, pp.weight, pp.at) from per_product pp
  )
  select (select count(*) from counted) + 0 * (select count(*) from demand) + 0 * (select count(*) from viewers)
    into v_rows;
  -- The ledger keeps today and yesterday (it was cleared now and then inside a buyer's view).
  delete from public.product_view_daily d where d.day < v_day - 1;
  return v_rows;
end
$function$;
revoke all on function admin.product_views_fold() from public, anon, authenticated;

-- Self-check: a queued view of a listing that doesn't exist is taken off the queue, and the fold doesn't fail.
do $check$
declare
  v_ghost uuid := gen_random_uuid();
  v_left integer;
begin
  insert into admin.product_view_queue (product_id, weight, vendor_id, viewer_id, at)
  values (v_ghost, 1, null, null, now());
  perform admin.product_views_fold();
  select count(*) into v_left from admin.product_view_queue where product_id = v_ghost;
  if v_left > 0 then
    raise exception 'views_fold: a deleted listing''s view stayed on the queue';
  end if;
end
$check$;

commit;
