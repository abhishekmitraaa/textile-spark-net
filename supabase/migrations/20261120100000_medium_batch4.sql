-- Medium bugs batch 4: speed and database (2026-11-20; plan documentation/medium-bugs-batch4-plan-2026-11-20.md).
--
-- 1. M-35 (Mitra: "Add the job"): a product view no longer rewrites products.views_count or clears old ledger rows in
--    the buyer's request. The view is recorded once a day per viewer as before (product_view_daily) and queued; the
--    job product-views-fold adds the queue into views_count and recent demand every minute, and clears old ledger
--    days. Counts on screen lag by up to a minute.
-- 2. M-33: ad_impressions(ads[]) queues several impressions in one call (the page sends the ads it showed together),
--    each campaign once per call.
-- 3. M-32: top_vendors() and new_brand_suggestions() read Standing with one join, not one function call per seller.
-- 4. M-37 (Mitra: "Hide deleted only"): when an account is deleted its live listings go to draft, so they leave every
--    feed, New Brands, For You and search at once. Suspension leaves live content up (the standing rule); ads already
--    stop for both (vendor_account_in_good_standing).
-- 5. M-75: a browser may set a logo, banner, premises photo or avatar only to a file in this project's public Storage
--    (a link to any other site could be a tracking pixel on someone else's screen). Missing foreign-key indexes added.

-- ── 1. Product views in batches ─────────────────────────────────────────────
create table if not exists admin.product_view_queue (
  id         bigint generated always as identity primary key,
  product_id uuid not null,
  weight     double precision not null,
  vendor_id  uuid,
  viewer_id  uuid,
  at         timestamptz not null default now()
);
revoke all on table admin.product_view_queue from public, anon, authenticated;

create or replace function public.increment_product_view(p uuid, p_viewer text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid    uuid := auth.uid();
  v_key    text;
  v_day    date := (now() at time zone 'Asia/Kolkata')::date;
  v_rows   integer;
  v_vendor uuid;
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

  -- Already counted today: nothing to do, and no lock taken.
  if exists (select 1 from public.product_view_daily d where d.product_id = p and d.viewer_key = v_key and d.day = v_day) then
    return;
  end if;
  -- A live listing, not the caller's own.
  select x.vendor_id into v_vendor from public.products x
   where x.id = p and x.status = 'live' and (v_uid is null or x.vendor_id <> v_uid);
  if v_vendor is null then
    return;
  end if;

  -- Signed-out views: at most 100 per listing per day (unchanged).
  if v_uid is null then
    if (select count(*) from public.product_view_daily d
         where d.product_id = p and d.day = v_day and d.viewer_key not like 'u:%') >= 100 then
      return;
    end if;
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
    -- Queued: admin.product_views_fold() adds it to the listing's count, recent demand and Standing's viewer
    -- ledger every minute (review M-35).
    insert into admin.product_view_queue (product_id, weight, vendor_id, viewer_id)
    values (p, public.listing_demand_weight(case when v_uid is null then 'view_signed_out' else 'view_signed_in' end),
            v_vendor, v_uid);
  end if;
end
$function$;

create or replace function admin.product_views_fold()
returns integer
language plpgsql
security definer
set search_path = ''
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
    select t.product_id, count(*)::integer as n, sum(t.weight) as weight, max(t.at) as at
      from taken t group by t.product_id
  ), counted as (
    update public.products x set views_count = x.views_count + pp.n
      from per_product pp where x.id = pp.product_id
    returning x.id
  ), viewers as (
    insert into admin.seller_viewer_daily (vendor_id, viewer_id, day)
    select distinct t.vendor_id, t.viewer_id, (t.at at time zone 'Asia/Kolkata')::date
      from taken t where t.viewer_id is not null and t.vendor_id is not null
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

do $job$
begin
  if exists (select 1 from cron.job where jobname = 'product-views-fold') then
    perform cron.unschedule('product-views-fold');
  end if;
  perform cron.schedule('product-views-fold', '* * * * *', 'select admin.product_views_fold();');
end
$job$;

-- ── 2. Several ad impressions in one call ─────────────────────────────────────
create or replace function public.ad_impressions(p_ads uuid[], p_session text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_ads is null or cardinality(p_ads) = 0 then return; end if;
  if cardinality(p_ads) > 48 then
    raise exception 'Too many ads in one call' using errcode = '22023';
  end if;
  -- The same rule as ad_impression(): every view of a running campaign is queued, no cap (Mitra, 2026-11-18).
  -- Each campaign once per call, as one ad_impression() call each (code review: 48 copies of one id in a call).
  insert into admin.ad_impression_queue (ad_id)
  select a.id from public.advertisements a
   where a.id in (select distinct x.id from unnest(p_ads) as x(id))
     and a.status = 'active';
end
$function$;
revoke all on function public.ad_impressions(uuid[], text) from public;
grant execute on function public.ad_impressions(uuid[], text) to anon, authenticated;

-- ── 3. Standing read once per query ──────────────────────────────────────────
create or replace function public.top_vendors(p_limit integer default 4)
returns table(id uuid, brand_name text, city text, rating_avg numeric, reviews_count integer, is_verified boolean,
              plan_expires_at timestamp with time zone, ad_verified_until timestamp with time zone, image_url text,
              live_products integer)
language sql
stable
security definer
set search_path to ''
as $function$
  with live as (
    select p.vendor_id, count(*)::integer as n,
           (array_agg(p.id order by p.created_at, p.id))[1] as first_id
      from public.products p
     where p.status = 'live'
     group by p.vendor_id
  )
  select v.id, v.brand_name, v.city, v.rating_avg::numeric, v.reviews_count::integer,
         v.is_verified, v.plan_expires_at, v.ad_verified_until,
         (select i.url from public.product_images i where i.product_id = live.first_id order by i.position limit 1),
         live.n
    from public.vendor_profiles v
    join live on live.vendor_id = v.id
    -- Standing read the way the public helper reads it (round 2, 0.5 when not yet computed), joined once (review M-32).
    left join admin.vendor_standing w on w.vendor_id = v.id
   where v.brand_name is not null
   -- Paid plan first, then Standing (20261115110000; profile score is one of its parts), then rating.
   order by (v.plan_expires_at is not null and v.plan_expires_at > now()) desc,
            coalesce(round(w.standing::numeric, 2), 0.5) desc,
            coalesce(v.rating_avg, 0) desc, coalesce(v.reviews_count, 0) desc, v.id
   limit least(greatest(coalesce(p_limit, 4), 1), 12);
$function$;

create or replace function public.new_brand_suggestions(p_limit integer default 12)
returns table(vendor_id uuid, brand_name text, city text, is_verified boolean, followers_count integer, logo_url text,
              live_count integer, top_products jsonb)
language sql
stable
security definer
set search_path to ''
as $function$
  with me as materialized (
    select (select auth.uid()) as uid
  ),
  recent as (
    select p.id, p.vendor_id, p.created_at
      from public.products p
     where p.status = 'live'
     order by p.created_at desc
     limit 5000
  ),
  sellers as (
    select r.vendor_id, max(r.created_at) as last_pictured_at
      from recent r
     where exists (select 1 from public.product_images i where i.product_id = r.id)
     group by r.vendor_id
  ),
  picked as (
    select s.vendor_id, s.last_pictured_at,
           (v.plan_expires_at is not null and v.plan_expires_at > now()) as paid,
           coalesce(round(w.standing::numeric, 2), 0.5) as standing  -- joined once (review M-32)
      from sellers s
      join public.vendor_profiles v on v.id = s.vendor_id
      left join admin.vendor_standing w on w.vendor_id = s.vendor_id
      cross join me
     where s.vendor_id is distinct from me.uid
       and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.vendor_id = s.vendor_id)
     -- Paid plan first, then Standing (20261115110000), then the most recent pictures.
     order by paid desc, standing desc, s.last_pictured_at desc, s.vendor_id
     limit least(greatest(coalesce(p_limit, 12), 1), 24)
  )
  select v.id, v.brand_name, v.city, v.is_verified, v.followers_count, v.logo_url,
         (select count(*)::int from public.products c where c.vendor_id = pk.vendor_id and c.status = 'live') as live_count,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'price_value', t.price_value,
                                               'currency', t.currency, 'image', t.image) order by t.ord)
             from (select p.id, p.name, p.price_value, p.currency, img.url as image,
                          row_number() over (order by coalesce(tr.log2_score, '-infinity'::double precision) desc, p.created_at desc, p.id) as ord /* recent demand, 20261017190000 */
                     from public.products p
                     left join public.product_trend tr on tr.product_id = p.id
                     cross join lateral (select i.url from public.product_images i
                                          where i.product_id = p.id order by i.position, i.id limit 1) img
                    where p.vendor_id = pk.vendor_id and p.status = 'live'
                    order by ord
                    limit 2) t), '[]'::jsonb) as top_products
    from picked pk
    join public.vendor_profiles v on v.id = pk.vendor_id
   order by pk.paid desc, pk.standing desc, pk.last_pictured_at desc, pk.vendor_id
$function$;

-- ── 4. A deleted account's live listings leave the feeds ─────────────────────
create or replace function admin.products_off_when_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.account_status = 'deleted' and old.account_status is distinct from 'deleted' then
    update public.products set status = 'draft' where vendor_id = new.id and status = 'live';
  end if;
  return new;
end
$function$;
revoke all on function admin.products_off_when_deleted() from public, anon, authenticated;

drop trigger if exists trg_profiles_products_off_when_deleted on public.profiles;
create trigger trg_profiles_products_off_when_deleted after update of account_status on public.profiles
  for each row execute function admin.products_off_when_deleted();

-- Any listed already (none on production on 2026-11-20).
update public.products x set status = 'draft'
  from public.profiles pr
 where pr.id = x.vendor_id and pr.account_status = 'deleted' and x.status = 'live';

-- ── 5. Pictures from this project's Storage only; indexes ────────────────────
create or replace function admin.own_storage_url(p_url text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  -- No origin on record: nothing passes but an empty value (fails closed).
  select p_url is null or p_url = ''
      or coalesce(p_url like (select s.origin from admin.storage_origin s limit 1) || '/storage/v1/object/public/%', false)
$function$;
revoke all on function admin.own_storage_url(text) from public, anon, authenticated;

create or replace function admin.image_urls_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_bad boolean := false;
begin
  if admin.trusted_caller() then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    v_bad := (tg_op = 'INSERT' or new.avatar_url is distinct from old.avatar_url) and not admin.own_storage_url(new.avatar_url);
  elsif tg_table_name = 'vendor_profiles' then
    v_bad := ((tg_op = 'INSERT' or new.logo_url is distinct from old.logo_url) and not admin.own_storage_url(new.logo_url))
          or ((tg_op = 'INSERT' or new.banner_url is distinct from old.banner_url) and not admin.own_storage_url(new.banner_url))
          or ((tg_op = 'INSERT' or new.office_photos is distinct from old.office_photos)
              and exists (select 1 from unnest(coalesce(new.office_photos, '{}'::text[])) u(x) where not admin.own_storage_url(u.x)));
  end if;
  if v_bad then
    raise exception 'Pictures must be uploaded to Cosora' using errcode = '22023', hint = 'image_url';
  end if;
  return new;
end
$function$;
revoke all on function admin.image_urls_check() from public, anon, authenticated;

drop trigger if exists trg_profiles_image_urls on public.profiles;
create trigger trg_profiles_image_urls before insert or update of avatar_url on public.profiles
  for each row execute function admin.image_urls_check();
drop trigger if exists trg_vendor_profiles_image_urls on public.vendor_profiles;
create trigger trg_vendor_profiles_image_urls before insert or update of logo_url, banner_url, office_photos on public.vendor_profiles
  for each row execute function admin.image_urls_check();

create index if not exists saved_folders_buyer_idx on public.saved_folders (buyer_id);
create index if not exists engagement_events_product_idx on public.engagement_events (product_id);
create index if not exists engagement_events_viewer_idx on public.engagement_events (viewer_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists conversation_reads_user_idx on public.conversation_reads (user_id);

-- ── 6. The Video Closeups reel on recent demand ──────────────────────────────
-- M-22: the reel was the 30 most viewed ever (a new video never showed), re-ranked in the browser on
-- product_videos.rating, which nothing writes. Now: the tagged live listing's recent demand (product_trend), plus the
-- video's own posting counted as one event of weight 10 (an enquiry's) at the time it went up, on the same log2 scale
-- (7-day half-life, documentation/ranking.md 3.2). A new video starts where a listing with an enquiry today stands,
-- and fades like one. Only ids come back: the page reads the videos through product_videos' own read rules.
-- demand_log_add / demand_log_of are written out inline (they carry a SET clause, so a call per row isn't inlined).
create or replace function public.video_closeups_feed(p_limit integer default 30)
returns table(video_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select s.id
    from (
      select v.id, v.created_at,
             coalesce(t.log2_score, '-infinity'::double precision) as a,
             ln(10.0) / ln(2.0)
               + extract(epoch from (v.created_at - timestamptz '2026-10-17 00:00:00+05:30')) / 604800.0 as b
        from public.product_videos v
        left join public.products x on x.id = v.product_id and x.status = 'live'
        left join public.product_trend t on t.product_id = x.id
       where v.status = 'live'
    ) s
   order by case
              when s.a = '-infinity'::double precision then s.b
              when least(s.a, s.b) - greatest(s.a, s.b) < -1000 then greatest(s.a, s.b)
              else greatest(s.a, s.b) + ln(1 + power(2.0, least(s.a, s.b) - greatest(s.a, s.b))) / ln(2.0)
            end desc,
            s.created_at desc, s.id
   limit least(greatest(coalesce(p_limit, 30), 1), 60);
$function$;
revoke all on function public.video_closeups_feed(integer) from public;
grant execute on function public.video_closeups_feed(integer) to anon, authenticated;

-- ── 7. A listing's review numbers from the database ──────────────────────────
-- M-24: the product page read every review of a listing and averaged them in the browser (PostgREST cuts at 1,000).
-- The same shape as vendor_review_stats (SH-108); product_reviews is readable by everyone, so this runs as the caller.
create or replace function public.product_review_summary(p_product uuid)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'count', count(*),
    'avg', round(avg(r.rating)::numeric, 1),
    'breakdown', (select jsonb_agg(jsonb_build_object('stars', s, 'count',
                     (select count(*) from public.product_reviews x where x.product_id = p_product and x.rating = s))
                     order by s desc)
                    from generate_series(1, 5) s))
    from public.product_reviews r
   where r.product_id = p_product
$function$;
revoke all on function public.product_review_summary(uuid) from public;
grant execute on function public.product_review_summary(uuid) to anon, authenticated;

-- ── 8. Seller Home's recent chats on their own ──────────────────────────────
-- M-68: a chat event re-ran the whole of seller_home_summary() (every open requirement counted through rfqs_select)
-- to refresh three chat rows. The chats are now seller_home_chats(); a chat event re-reads only it. The summary still
-- returns 'recent_chats' from the same function, so an app from before this release keeps working.
create or replace function public.seller_home_chats()
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with me as materialized (select (select auth.uid()) as uid),
  chats as (
    select c.id, case when c.user_a = me.uid then c.user_b else c.user_a end as other_id,
           c.last_message, c.last_message_at
      from public.conversations c
      cross join me
      left join public.conversation_member_state ms on ms.conversation_id = c.id and ms.user_id = me.uid
     where (c.user_a = me.uid or c.user_b = me.uid)
       and c.last_message_at is not null
       and ms.archived_at is null
       and (ms.cleared_at is null or c.last_message_at > ms.cleared_at)
     order by c.last_message_at desc
     limit 3
  ),
  unread as (
    select u.conversation_id, u.unread from public.chat_unread_counts() u
     where u.conversation_id in (select ch.id from chats ch)
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'other_id', ch.other_id,
             'name', coalesce(vp.brand_name, pr.full_name, 'User'),
             'avatar', pr.avatar_url,
             'last_message', ch.last_message,
             'last_message_at', ch.last_message_at,
             'unread', coalesce(u.unread, 0))
           order by ch.last_message_at desc)
      from chats ch
      left join public.vendor_profiles vp on vp.id = ch.other_id
      left join public.profiles pr on pr.id = ch.other_id
      left join unread u on u.conversation_id = ch.id), '[]'::jsonb)
  where (select uid from me) is not null
$function$;
revoke all on function public.seller_home_chats() from public, anon;
grant execute on function public.seller_home_chats() to authenticated;

-- The summary's chats come from it: the two CTEs and the block are cut out by anchored replacement (the rest of the
-- function, including batch 3's lead order, is kept as it is).
do $patch$
declare
  -- Production's stored body has Windows line endings (migrations applied from Windows; 30 functions, checked
  -- 2026-11-20): the anchors are matched on LF, so the body is read as LF first.
  def text := replace(pg_get_functiondef('public.seller_home_summary()'::regprocedure), E'\r\n', E'\n');
  a1 text := E'),\n  unread as (';
  a2 text := E'  select jsonb_build_object(';
  b1 text := E'    ''recent_chats'', coalesce((';
  b2 text := E'''[]''::jsonb)\n  ) into result;';
  i1 int; i2 int; j1 int; j2 int;
begin
  if position('public.seller_home_chats()' in def) > 0 then
    return;  -- already patched
  end if;
  i1 := position(a1 in def);
  i2 := position(a2 in def);
  j1 := position(b1 in def);
  j2 := position(b2 in substr(def, greatest(j1, 1))) + greatest(j1, 1) - 1;
  if i1 = 0 or i2 = 0 or i2 < i1 or j1 = 0 or j2 < j1
     or (length(def) - length(replace(def, a1, ''))) / length(a1) <> 1
     or (length(def) - length(replace(def, b1, ''))) / length(b1) <> 1 then
    raise exception 'seller_home_summary patch: anchors not found once';
  end if;
  def := substr(def, 1, j1 - 1) || E'    ''recent_chats'', public.seller_home_chats()\n  ) into result;'
      || substr(def, j2 + length(b2));
  def := substr(def, 1, i1 - 1) || E')\n' || substr(def, i2);
  execute def;
end
$patch$;

-- ── 9. A buyer's links to a seller pass the platform rules ──────────────────
-- Code review of batch 3 (M-50): chat_buyer_social() let any http(s) address through under any platform, so a
-- "Facebook" chip on the seller's buyer card could open any site (or a wa.me link round the chat's number lock). Now
-- the rule of normaliseSocialLink() (src/lib/socialLinks.ts), which the seller's own links already follow: https only,
-- a plain host (no user@), each platform's own hosts with an account path, and "Website" none of the platforms and no
-- messaging service.
create or replace function public.chat_buyer_social(p_other uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with raw as (
    select k.key, btrim(k.value) as v
      from public.buyer_profiles bp,
           jsonb_each_text(case when jsonb_typeof(bp.social) = 'object' then bp.social else '{}'::jsonb end) k
     where bp.id = p_other
       and k.key in ('facebook', 'x', 'linkedin', 'youtube', 'instagram', 'other')
  ),
  parsed as (
    select r.key, r.v,
           lower(substring(r.v from '^[Hh][Tt][Tt][Pp][Ss]://([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?:[/?#]|$)')) as host,
           coalesce(substring(r.v from '^[Hh][Tt][Tt][Pp][Ss]://[^/?#]+([/?#].*)$'), '') as rest
      from raw r
     where length(r.v) <= 300 and r.v !~ '\s'
  )
  select coalesce((
    select jsonb_object_agg(p.key, p.v)
      from parsed p
     where p.host is not null
       and case p.key
             when 'facebook'  then p.host ~ '(^|\.)(facebook\.com|fb\.com)$'
             when 'x'         then p.host ~ '(^|\.)(x\.com|twitter\.com)$'
             when 'linkedin'  then p.host ~ '(^|\.)linkedin\.com$'
             when 'youtube'   then p.host ~ '(^|\.)(youtube\.com|youtu\.be)$'
             when 'instagram' then p.host ~ '(^|\.)instagram\.com$'
             else p.host !~ '(^|\.)(facebook\.com|fb\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|youtu\.be|instagram\.com)$'
                  -- Never a messaging or contact service: the chat locks on a phone number, and a link to one would
                  -- hand the number over round it (security review, 2026-11-20). MESSAGING_HOSTS in socialLinks.ts.
                  and p.host !~ '(^|\.)(wa\.me|whatsapp\.com|t\.me|telegram\.me|telegram\.dog|telegram\.org|signal\.me|signal\.group|m\.me|messenger\.com|viber\.com|line\.me)$'
           end
       -- A platform's own address with no account in it ("/", "/?x") isn't a link to the buyer.
       and (p.key = 'other' or p.rest ~ '^/[^/?#]')
  ), '{}'::jsonb)
  where (select auth.uid()) is not null
    and p_other <> (select auth.uid())
    and exists (select 1 from public.conversations c
                  join public.messages m on m.conversation_id = c.id and m.sender_id = p_other
                 where (c.user_a = (select auth.uid()) and c.user_b = p_other)
                    or (c.user_b = (select auth.uid()) and c.user_a = p_other))
    and not public.chat_blocked_between((select auth.uid()), p_other);
$$;
revoke all on function public.chat_buyer_social(uuid) from public, anon;
grant execute on function public.chat_buyer_social(uuid) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $$
begin
  if position('views_count' in pg_get_functiondef('public.increment_product_view(uuid, text)'::regprocedure)) > 0 then
    raise exception 'self-check: increment_product_view still writes views_count';
  end if;
  if not exists (select 1 from cron.job where jobname = 'product-views-fold' and active) then
    raise exception 'self-check: product-views-fold is not scheduled';
  end if;
  if position('vendor_standing(' in pg_get_functiondef('public.top_vendors(integer)'::regprocedure)) > 0
     or position('public.vendor_standing(' in pg_get_functiondef('public.new_brand_suggestions(integer)'::regprocedure)) > 0 then
    raise exception 'self-check: standing still read per seller';
  end if;
  if has_table_privilege('anon', 'admin.product_view_queue', 'insert')
     or has_function_privilege('authenticated', 'admin.product_views_fold()', 'execute') then
    raise exception 'self-check: browsers can reach the view queue';
  end if;
  -- The reel's inline formula is the one the shared helpers compute.
  if exists (
    with f as (select f.video_id, f.n from public.video_closeups_feed(60) with ordinality f(video_id, n)),
    r as (select v.id, row_number() over (
                   order by public.demand_log_add(coalesce(t.log2_score, '-infinity'::double precision),
                                                  public.demand_log_of(10, v.created_at)) desc, v.created_at desc, v.id) as n
            from public.product_videos v
            left join public.products x on x.id = v.product_id and x.status = 'live'
            left join public.product_trend t on t.product_id = x.id
           where v.status = 'live')
    select 1 from f full join (select * from r where n <= 60) r2 on r2.n = f.n
     where f.video_id is distinct from r2.id) then
    raise exception 'self-check: video_closeups_feed order differs from demand_log_add / demand_log_of';
  end if;
end $$;
