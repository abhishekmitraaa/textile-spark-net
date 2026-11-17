-- Seller Home audit SH-077 (2026-11-17), part 1 of 2: seller Analytics reads its visits through a definer function
-- that names nobody.
--
-- The engagement_events SELECT policy (vendor_id = auth.uid()) handed sellers raw viewer_id, session_id and
-- query_text. profiles.full_name is readable by anyone, so a seller could name each signed-in viewer and see exactly
-- what they searched. The rule (vendor_buyer_geography, Live Activity): a seller sees counts, and a buyer is never
-- identifiable; fewer than 3 different visitors is folded away.
--
-- public.vendor_engagement_events(p_days) returns the caller's own events for the window, as Analytics tallies them:
--   visitor_key  a hash of the visitor salted per call: equal within one answer (unique-visitor counts), meaningless
--                across answers and impossible to match to an account id.
--   signed_in    whether the visitor was signed in (the "signed-out views" figure).
--   query_text   the search term, lower-cased, only when at least 3 different visitors searched it for this seller in
--                the window (Mitra, 2026-11-17: "3-person floor"); otherwise null, shown as "Other searches".
-- Part 2 (20261117100300) takes the identifying columns away from browser roles, once this app is live.

create or replace function public.vendor_engagement_events(p_days integer)
returns table (
  event_type text,
  product_id uuid,
  ad_id uuid,
  visitor_key text,
  signed_in boolean,
  source text,
  query_text text,
  cta_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  with me as (
    select (select auth.uid()) as uid,
           now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365)) as since,
           gen_random_uuid()::text as salt
  ),
  ev as (
    select e.*,
           coalesce('u:' || e.viewer_id::text, 's:' || e.session_id, 'e:' || e.id::text) as who,
           nullif(lower(btrim(regexp_replace(coalesce(e.query_text, ''), '\s+', ' ', 'g'))), '') as term
      from public.engagement_events e, me
     where me.uid is not null
       and e.vendor_id = me.uid
       and e.created_at >= me.since
     order by e.created_at desc
     limit 10000
  ),
  terms as (
    select term
      from ev
     where term is not null and event_type in ('search_impression', 'search_click')
     group by term
    having count(distinct who) >= 3
  )
  select ev.event_type,
         ev.product_id,
         ev.ad_id,
         md5((select salt from me) || ev.who) as visitor_key,
         ev.viewer_id is not null as signed_in,
         ev.source,
         case when ev.term in (select term from terms) then ev.term end as query_text,
         ev.cta_name,
         ev.created_at
    from ev
   order by ev.created_at desc
$function$;

revoke all on function public.vendor_engagement_events(integer) from public, anon;
grant execute on function public.vendor_engagement_events(integer) to authenticated;

-- Self-check: a term two people searched is hidden, one three people searched is shown; nothing identifies anyone.
do $check$
declare
  v_vendor uuid;
  v_shown int;
  v_hidden int;
begin
  select id into v_vendor from public.vendor_profiles order by created_at limit 1;
  if v_vendor is null then
    raise notice 'vendor_engagement_events: no vendor to test with, self-check skipped';
    return;
  end if;
  insert into public.engagement_events (event_type, vendor_id, session_id, source, query_text)
  select 'search_impression', v_vendor, 'selfcheck-' || g, 'organic_search',
         case when g <= 3 then 'Selfcheck Floor Term' else 'selfcheck rare term' end
    from generate_series(1, 5) g;
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) filter (where query_text = 'selfcheck floor term'),
         count(*) filter (where query_text = 'selfcheck rare term')
    into v_shown, v_hidden
    from public.vendor_engagement_events(1);
  reset role;
  delete from public.engagement_events where session_id like 'selfcheck-%' and vendor_id = v_vendor;
  if v_shown <> 3 or v_hidden <> 0 then
    raise exception 'vendor_engagement_events self-check: floor term shown % (want 3), rare term shown % (want 0)', v_shown, v_hidden;
  end if;
end
$check$;
