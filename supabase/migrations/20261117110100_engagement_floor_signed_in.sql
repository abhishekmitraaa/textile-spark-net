-- Seller Home audit SH-077, follow-up (2026-11-17, after the push security review): the 3-person floor on seller
-- Analytics search terms counts signed-in visitors only, never the seller or Cosora staff. 20261117100200 counted any
-- session id, which a script can invent. Same function otherwise; grants are kept by CREATE OR REPLACE.

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
    -- Only signed-in visitors count toward the floor (push security review, 2026-11-17): a guest is just a session id
    -- the browser sends, so a script could pose as 3 guests and confirm that a buyer searched a guessed term. The
    -- seller themself and Cosora staff never count. (While the test sign-in code is on, accounts are cheap to make, so
    -- this raises the cost of that guess rather than ruling it out; securityflags.md.)
    select term
      from ev
     where term is not null and event_type in ('search_impression', 'search_click')
       and ev.viewer_id is not null
       and ev.viewer_id <> (select uid from me)
       and not exists (select 1 from admin.admin_users u where u.id = ev.viewer_id and u.is_active)
     group by term
    having count(distinct ev.viewer_id) >= 3
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

-- Self-check: three guest sessions no longer publish a term; three signed-in buyers do.
do $check$
declare
  v_vendor uuid;
  v_buyers uuid[];
  v_guest int;
  v_signed int;
begin
  select id into v_vendor from public.vendor_profiles order by created_at limit 1;
  select array_agg(id) into v_buyers from (
    select p.id from public.profiles p
     where p.id <> v_vendor and not exists (select 1 from admin.admin_users u where u.id = p.id)
     order by p.created_at limit 3) x;
  if v_vendor is null or coalesce(array_length(v_buyers, 1), 0) < 3 then
    raise notice 'vendor_engagement_events floor: not enough accounts to test with, self-check skipped';
    return;
  end if;
  insert into public.engagement_events (event_type, vendor_id, session_id, source, query_text)
  select 'search_impression', v_vendor, 'floorcheck-' || g, 'organic_search', 'Floorcheck Guest Term' from generate_series(1, 3) g;
  insert into public.engagement_events (event_type, vendor_id, viewer_id, source, query_text)
  select 'search_impression', v_vendor, b, 'organic_search', 'Floorcheck Signed Term' from unnest(v_buyers) b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_vendor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) filter (where query_text = 'floorcheck guest term'),
         count(*) filter (where query_text = 'floorcheck signed term')
    into v_guest, v_signed
    from public.vendor_engagement_events(1);
  reset role;
  delete from public.engagement_events
   where vendor_id = v_vendor and query_text in ('Floorcheck Guest Term', 'Floorcheck Signed Term');
  if v_guest <> 0 or v_signed <> 3 then
    raise exception 'vendor_engagement_events floor self-check: guest term shown % (want 0), signed-in term shown % (want 3)', v_guest, v_signed;
  end if;
end
$check$;
