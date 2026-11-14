-- Ranking Standing (Part 2): how good a seller is to send a buyer to (2026-11-15; Mitra: "fix on your own",
-- then "continue"). Design: documentation/ranking-standing-design-2026-11-15.md; harness scripts/ranking/standing.sql.
--
-- Standing = 0.30 buyer interest + 0.25 reviews + 0.15 activity + 0.15 trust + 0.15 profile score, from 0 to 1,
-- kept per seller in admin.vendor_standing and refreshed hourly. Paid plan still goes first wherever it did;
-- Standing replaces profile score inside each tier. A buyer's own quotes are ordered by Standing alone.

-- ── The kept score ─────────────────────────────────────────────────────────────────────────────────────────
create table admin.vendor_standing (
  vendor_id    uuid primary key references public.vendor_profiles(id) on delete cascade,
  standing     double precision not null check (standing between 0 and 1),
  i            double precision not null,
  r            double precision not null,
  a            double precision not null,
  t            double precision not null,
  p            double precision not null,
  computed_at  timestamptz not null default now()
);
revoke all on table admin.vendor_standing from public, anon, authenticated;
comment on table admin.vendor_standing is
  'Ranking Standing per seller (20261115110000): the total and its five parts. Not readable by clients; public.vendor_standing() returns the total, rounded.';

-- ── The five parts, computed now ───────────────────────────────────────────────────────────────────────────
create function admin.vendor_standing_parts(p_vendor uuid)
returns table(i double precision, r double precision, a double precision, t double precision, p double precision,
              standing double precision)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_onboarded boolean;
  v_verified  boolean;
  v_ad_seal   timestamptz;
  v_score     integer;
  v_people    integer;
  v_repeat    integer;
  v_mean      double precision;
  v_n         integer;
  v_sum       double precision;
  v_quotes    integer;
  v_hours     double precision;
  v_volume    double precision;
  v_speed     double precision;
  v_reg       boolean;
  v_doc       boolean;
  v_seal      boolean;
  v_fraud     boolean;
  v_first     timestamptz;
begin
  select vp.onboarding_complete, vp.is_verified, vp.ad_verified_until, vp.profile_score
    into v_onboarded, v_verified, v_ad_seal, v_score
    from public.vendor_profiles vp where vp.id = p_vendor;
  if not found then
    return;
  end if;

  -- Buyer interest: distinct signed-in people over 90 days (listing viewers, new followers, people who messaged
  -- the seller; each counts once across all three), plus viewers who came back on another day. A signed-out
  -- viewer's key is made by the browser, so anyone could mint them: those views don't count (security review,
  -- 2026-11-15).
  select count(*) into v_people from (
    select d.viewer_key as k
      from public.product_view_daily d join public.products pr on pr.id = d.product_id
     where pr.vendor_id = p_vendor and d.day >= current_date - 90 and d.viewer_key like 'u:%'
       and d.viewer_key <> 'u:' || p_vendor
    union
    select 'u:' || f.follower_id from public.follows f
     where f.vendor_id = p_vendor and f.created_at >= now() - interval '90 days'
    union
    select 'u:' || m.sender_id
      from public.messages m join public.conversations c on c.id = m.conversation_id
     where p_vendor in (c.user_a, c.user_b) and m.sender_id <> p_vendor and m.created_at >= now() - interval '90 days'
  ) people;
  select count(*) into v_repeat from (
    select d.viewer_key
      from public.product_view_daily d join public.products pr on pr.id = d.product_id
     where pr.vendor_id = p_vendor and d.day >= current_date - 90 and d.viewer_key like 'u:%'
       and d.viewer_key <> 'u:' || p_vendor
     group by d.viewer_key having count(distinct d.day) >= 2
  ) back;
  i := least(1, ln(1 + v_people + v_repeat) / ln(201));

  -- Reviews: the seller's and its listings', pulled towards Cosora's average by 5 imaginary reviews.
  select avg(x) into v_mean from (select rv.rating::double precision as x from public.reviews rv
                                  union all select pv.rating::double precision from public.product_reviews pv) allr;
  v_mean := coalesce(v_mean, 4);
  select count(*), coalesce(sum(x), 0) into v_n, v_sum from (
    select rv.rating::double precision as x from public.reviews rv where rv.vendor_id = p_vendor
    union all
    select pv.rating::double precision from public.product_reviews pv join public.products pr on pr.id = pv.product_id
     where pr.vendor_id = p_vendor
  ) mine;
  r := ((5 * v_mean + v_sum) / (5 + v_n) - 1) / 4;

  -- Activity: quotes over 90 days, and the median hours from a requirement going live to the quote.
  select count(*), percentile_cont(0.5) within group (order by extract(epoch from (q.created_at - rq.created_at)) / 3600)
    into v_quotes, v_hours
    from public.quotes q join public.rfqs rq on rq.id = q.rfq_id
   where q.vendor_id = p_vendor and q.created_at >= now() - interval '90 days';
  v_volume := least(1, ln(1 + v_quotes) / ln(31));
  v_speed := case when v_quotes = 0 or v_hours is null then 0 else greatest(0, least(1, (72 - v_hours) / 68)) end;
  a := (v_volume + v_speed) / 2;

  -- Trust: an approved registration (or, before registrations were reviewed, a completed onboarding with no
  -- registration on file), a verified document, the verified or bought seal. A finding of fraud zeroes it.
  v_reg := exists (select 1 from public.vendor_registrations g where g.vendor_id = p_vendor and g.status = 'registered')
           or (coalesce(v_onboarded, false)
               and not exists (select 1 from public.vendor_registrations g where g.vendor_id = p_vendor));
  v_doc := exists (select 1 from public.vendor_documents d where d.vendor_id = p_vendor and d.verified);
  v_seal := coalesce(v_verified, false) or coalesce(v_ad_seal > now(), false);
  v_fraud := exists (select 1 from admin.fraud_findings ff
                      where ff.subject_profile_id = p_vendor and ff.withdrawn_at is null);
  t := case when v_fraud then 0 else 0.5 * v_reg::int + 0.25 * v_doc::int + 0.25 * v_seal::int end;

  p := least(1, greatest(0, coalesce(v_score, 0) / 100.0));

  -- A new seller (an account under 30 days old) isn't buried for having no history. The account's age, not its
  -- listings': unlisting everything and listing afresh mustn't make an old seller new (security review, 2026-11-15).
  select vp.created_at into v_first from public.vendor_profiles vp where vp.id = p_vendor;
  if v_first is not null and v_first > now() - interval '30 days' then
    i := greatest(i, 0.5);
    a := greatest(a, 0.5);
  end if;

  standing := 0.30 * i + 0.25 * r + 0.15 * a + 0.15 * t + 0.15 * p;
  if v_fraud then
    standing := standing / 2;
  end if;
  return next;
end
$function$;
revoke all on function admin.vendor_standing_parts(uuid) from public, anon, authenticated;

create function admin.refresh_vendor_standing()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rows integer;
begin
  insert into admin.vendor_standing (vendor_id, standing, i, r, a, t, p, computed_at)
  select v.id, s.standing, s.i, s.r, s.a, s.t, s.p, now()
    from public.vendor_profiles v
    cross join lateral admin.vendor_standing_parts(v.id) s
  on conflict (vendor_id) do update
    set standing = excluded.standing, i = excluded.i, r = excluded.r, a = excluded.a, t = excluded.t,
        p = excluded.p, computed_at = excluded.computed_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end
$function$;
revoke all on function admin.refresh_vendor_standing() from public, anon, authenticated;

-- ── What the app and the rankings read ─────────────────────────────────────────────────────────────────────
-- The total, rounded to 2 decimals; 0.5 for a seller not computed yet. For the definer rankings only: no client
-- can call it, so nobody can watch a seller's number (a fraud finding halves it; security review, 2026-11-15).
-- top_vendors and new_brand_suggestions become definer functions below to read it.
create function public.vendor_standing(p_vendor uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select round(w.standing::numeric, 2) from admin.vendor_standing w where w.vendor_id = p_vendor), 0.5)
$function$;
revoke all on function public.vendor_standing(uuid) from public, anon, authenticated;
grant execute on function public.vendor_standing(uuid) to service_role;

-- A buyer's own requirement: its quotes, best-standing seller first (no paid tier: the buyer asked these
-- sellers for offers). Ids and positions only.
create function public.quote_order_for_rfq(p_rfq uuid)
returns table(quote_id uuid, "position" integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (select 1 from public.rfqs r where r.id = p_rfq and r.buyer_id = auth.uid()) then
    raise exception 'not your requirement' using errcode = '42501';
  end if;
  return query
    select q.id, (row_number() over (order by public.vendor_standing(q.vendor_id) desc, q.created_at, q.id))::integer
      from public.quotes q
     where q.rfq_id = p_rfq;
end
$function$;
revoke all on function public.quote_order_for_rfq(uuid) from public, anon;
grant execute on function public.quote_order_for_rfq(uuid) to authenticated, service_role;

-- ── The five seller rankings: Standing where profile score was ─────────────────────────────────────────

-- Bodies are production's (md5s pinned in the release file) with only the profile-score lines changed.

CREATE OR REPLACE FUNCTION public.top_vendors(p_limit integer DEFAULT 4)
 RETURNS TABLE(id uuid, brand_name text, city text, rating_avg numeric, reviews_count integer, is_verified boolean, plan_expires_at timestamp with time zone, ad_verified_until timestamp with time zone, image_url text, live_products integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   where v.brand_name is not null
   -- Paid plan first, then Standing (20261115110000; profile score is one of its parts), then rating.
   order by (v.plan_expires_at is not null and v.plan_expires_at > now()) desc,
            public.vendor_standing(v.id) desc,
            coalesce(v.rating_avg, 0) desc, coalesce(v.reviews_count, 0) desc, v.id
   limit least(greatest(coalesce(p_limit, 4), 1), 12);
$function$;

CREATE OR REPLACE FUNCTION public.new_brand_suggestions(p_limit integer DEFAULT 12)
 RETURNS TABLE(vendor_id uuid, brand_name text, city text, is_verified boolean, followers_count integer, logo_url text, live_count integer, top_products jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           (v.plan_expires_at is not null and v.plan_expires_at > now()) as paid, public.vendor_standing(v.id) as standing
      from sellers s
      join public.vendor_profiles v on v.id = s.vendor_id, me
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

CREATE OR REPLACE FUNCTION public.search_suggestions(q text, max_results integer DEFAULT 5)
 RETURNS TABLE(kind text, label text, ref_id uuid, count_hint integer, verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with n as (select public.normalise_search_query(q) as qn)
  -- Categories that actually contain live products. count_hint is the real
  -- number of listings a buyer will land on, not a fabricated search volume.
  (
    select 'category'::text, c.category_name, c.cid, c.n_products, null::boolean
    from (
      -- min() has no uuid variant; any representative id for the name will do.
      select p.category_name,
             (array_agg(p.category_id order by p.category_id))[1] as cid,
             count(*)::int as n_products
      from public.products p, n
      where p.status = 'live'
        and p.category_name is not null
        and n.qn is not null
        and p.category_name ilike '%' || n.qn || '%'
      group by p.category_name
    ) c
    order by c.n_products desc, c.category_name
    limit max_results
  )
  union all
  -- Individual live listings, most in demand recently first.
  (
    select 'product'::text, p.name, p.id, p.enquiries_count, null::boolean
    from public.products p
    cross join n
    left join public.product_trend tr on tr.product_id = p.id
    where p.status = 'live'
      and n.qn is not null
      and p.name ilike '%' || n.qn || '%'
    order by coalesce(tr.log2_score, '-infinity'::double precision) desc, p.name /* recent demand, 20261017190000 */
    limit max_results
  )
  union all
  -- Real vendor storefronts. count_hint is the real follower count.
  (
    select 'vendor'::text, v.brand_name, v.id, v.followers, v.is_verified
    from (
      select vp.id, vp.brand_name, vp.is_verified,
             (vp.plan_expires_at is not null and vp.plan_expires_at > now()) as paid,
             public.vendor_standing(vp.id) as standing,
             (select count(*)::int from public.follows f where f.vendor_id = vp.id) as followers
      from public.vendor_profiles vp, n
      where n.qn is not null
        and vp.brand_name is not null
        and vp.brand_name ilike '%' || n.qn || '%'
    ) v
    -- Paid plan first, then Standing (20261115110000), then followers.
    order by v.paid desc, v.standing desc, v.followers desc, v.brand_name
    limit max_results
  );
$function$;

CREATE OR REPLACE FUNCTION public.match_rfq_vendors(p_rfq_id uuid, match_count integer DEFAULT 20)
 RETURNS TABLE(vendor_id uuid, similarity double precision, category_match boolean, score double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with rfq as (
    select r.id, r.embedding, r.category_id, r.buyer_id
    from public.rfqs r
    where r.id = p_rfq_id
  ),
  vec as (
    select v.id as vendor_id,
           (1 - (v.catalog_embedding <=> (select embedding from rfq)))::double precision as similarity
    from public.vendor_profiles v
    where v.catalog_embedding is not null
      and (select embedding from rfq) is not null
    order by v.catalog_embedding <=> (select embedding from rfq)
    limit greatest(coalesce(match_count, 20), 20)
  ),
  cat as (
    select distinct p.vendor_id
    from public.products p, rfq r
    where p.status = 'live'
      and r.category_id is not null
      -- 2026-10-17: "Others (custom)" is every seller's category (one with a live listing).
      and (p.category_id = r.category_id or public.rfq_category_is_open(r.category_id))
  )
  select
    coalesce(vec.vendor_id, cat.vendor_id)                          as vendor_id,
    vec.similarity                                                  as similarity,
    (cat.vendor_id is not null)                                     as category_match,
    (0.7 * coalesce(vec.similarity, 0)
       + 0.3 * (cat.vendor_id is not null)::int)::double precision  as score
  from vec
  full outer join cat on cat.vendor_id = vec.vendor_id
  left join public.vendor_profiles vp on vp.id = coalesce(vec.vendor_id, cat.vendor_id)
  -- A seller blocked by the buyer, or who blocked them, is never matched (no alert, no digest).
  where not public.chat_blocked_between(coalesce(vec.vendor_id, cat.vendor_id), (select buyer_id from rfq))
  -- Paid plan first; then the match, with Standing as a smaller push (up to 0.1 against a match of up to 1),
  -- so a close match still beats a well-standing seller that sells something else (20261115110000; it was the
  -- profile score, now one of Standing's parts). The score returned stays the match alone.
  order by (vp.plan_expires_at is not null and vp.plan_expires_at > now()) desc,
           (0.7 * coalesce(vec.similarity, 0) + 0.3 * (cat.vendor_id is not null)::int
              + 0.1 * public.vendor_standing(vp.id)) desc,
           similarity desc nulls last, 1
  limit coalesce(match_count, 20);
$function$;

CREATE OR REPLACE FUNCTION admin.lead_alert_fanout(p_rfq uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r        public.rfqs;
  cfg      admin.lead_alert_config;
  m        record;
  s        public.lead_alert_settings;
  v_plan   text[];
  v_now    text[];
  v_ext    text[];
  v_sent   text[];
  v_res    jsonb;
  v_held   text;
  v_id     uuid;
  v_cat    text;
  v_title  text;
  v_qty    text;
  v_clock  time := (now() at time zone 'Asia/Kolkata')::time;
  v_before integer;
  v_wait   text;
  n        integer := 0;
begin
  select * into r from public.rfqs where id = p_rfq;
  if not found or r.status::text <> 'active' or r.vendor_id is not null or r.removed_at is not null then
    return 0;
  end if;
  select * into cfg from admin.lead_alert_config;
  if r.created_at < now() - make_interval(hours => cfg.max_age_hours) then
    return 0;
  end if;
  -- One buyer's fan-outs run one at a time. The buyer's daily cap and a requirement's total
  -- count what earlier fan-outs wrote, so two running together would each find room: a
  -- buyer posting several requirements in the same instant would pass the cap with all of
  -- them. The lock is the buyer's own, so one account can't hold up anyone else's post. (The
  -- vendor's hourly cap is counted without a lock across buyers: fan-outs from different
  -- buyers that overlap can exceed it by as many as overlap.) The wait is bounded: a
  -- fan-out that can't start within three seconds raises, which its callers record and the
  -- daily run retries.
  v_wait := current_setting('lock_timeout');
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(hashtextextended('cosora.lead_alert_fanout:' || r.buyer_id::text, 0));
  perform set_config('lock_timeout', v_wait, true);

  -- One buyer can't use alerts to reach vendors at will: past buyer_daily_cap requirements
  -- that raised alerts in 24 hours, the next ones tell nobody (they are still on Leads).
  if (select count(*) from admin.lead_alert_runs x join public.rfqs q on q.id = x.rfq_id
       where q.buyer_id = r.buyer_id and x.rfq_id <> p_rfq and x.alerted > 0 and x.ran_at > now() - interval '24 hours') >= cfg.buyer_daily_cap then
    insert into admin.lead_alert_runs (rfq_id, with_embedding, skipped) values (p_rfq, r.embedding is not null, 'buyer_cap')
    on conflict (rfq_id) do update set ran_at = now(), skipped = 'buyer_cap', error = null;
    return 0;
  end if;
  insert into admin.lead_alert_runs (rfq_id, with_embedding) values (p_rfq, r.embedding is not null)
  on conflict (rfq_id) do update
     set ran_at = now(), with_embedding = admin.lead_alert_runs.with_embedding or excluded.with_embedding, error = null;
  -- Both passes together tell at most max_vendors vendors.
  select count(*) into v_before from admin.lead_alerts a where a.rfq_id = p_rfq;

  select c.name into v_cat from public.categories c where c.id = r.category_id;
  v_title := admin.alert_text(coalesce(nullif(btrim(r.title), ''), r.product_name), 120);
  v_qty := case when r.quantity is not null and r.quantity > 0 then r.quantity::text else null end;

  -- More candidates than will be told are asked for: before the embedding arrives every
  -- vendor in the category scores the same, and who is told must not depend on their id.
  for m in
    select x.vendor_id, x.category_match, x.score, e.plan_id, p.limits
      from public.match_rfq_vendors(p_rfq, cfg.max_vendors * 4) x
      cross join lateral admin.vendor_effective_plan(x.vendor_id, now()) e
      join public.subscription_plans p on p.id = e.plan_id
     where (x.category_match or coalesce(x.similarity, 0) >= cfg.min_similarity)
       and x.vendor_id <> r.buyer_id
       and jsonb_array_length(coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb)) > 0
       and admin.feature_on_for('lead_alerts', x.vendor_id)
       and public.vendor_account_in_good_standing(x.vendor_id)
       and public.overseas_rfq_visible(r.overseas, r.overseas_vip_until, admin.vendor_overseas_tier(x.vendor_id))
     -- VIP is told first; then the closest match; between equals, the bigger plan.
     order by coalesce((p.limits ->> 'lead_alert_priority')::boolean, false) desc,
              x.score + 0.1 * public.vendor_standing(x.vendor_id) desc,  -- Standing, 20261115110000
              p.sort_order desc, x.vendor_id
  loop
    exit when v_before + n >= cfg.max_vendors;
    select * into s from public.lead_alert_settings ls where ls.vendor_id = m.vendor_id;
    -- 2026-10-17: a seller's own category filter doesn't skip "Others (custom)": it is meant for every seller.
    if s.category_ids is not null and not public.rfq_category_is_open(r.category_id)
       and (r.category_id is null or not (r.category_id = any (s.category_ids))) then
      continue;
    end if;

    v_plan := array(select jsonb_array_elements_text(m.limits -> 'lead_alert_channels'));
    v_now := array(select c from unnest(v_plan) c where c <> 'digest');
    v_held := null;
    if not coalesce(s.instant, true) then
      v_now := '{}'; v_held := 'off';
    elsif cardinality(v_now) = 0 then
      v_held := 'digest_only';
    elsif (select count(*) from admin.lead_alerts a
            where a.vendor_id = m.vendor_id and a.created_at > now() - interval '1 hour' and cardinality(a.channels) > 0) >= cfg.hourly_cap then
      v_now := '{}'; v_held := 'rate_limit';
    elsif s.quiet_start is not null and (
            (s.quiet_start <= s.quiet_end and v_clock >= s.quiet_start and v_clock < s.quiet_end)
            or (s.quiet_start > s.quiet_end and (v_clock >= s.quiet_start or v_clock < s.quiet_end))) then
      -- Quiet hours: the bell still rings; nothing is sent to a phone or inbox.
      v_now := array(select c from unnest(v_now) c where c = 'app'); v_held := 'quiet_hours';
    end if;

    v_id := null;
    insert into admin.lead_alerts (rfq_id, vendor_id, score, category_match, plan_id, held)
    values (p_rfq, m.vendor_id, m.score, m.category_match, m.plan_id, v_held)
    on conflict (rfq_id, vendor_id) do nothing
    returning id into v_id;
    if v_id is null then
      continue;   -- told on the first pass
    end if;
    n := n + 1;

    -- The row records what actually went out: the bell, and each channel a message was
    -- queued on (not one that is waiting for a template, a consent or an address).
    v_sent := '{}';
    if 'app' = any (v_now) then
      perform public.notify(m.vendor_id, 'lead_match', 'New requirement: ' || v_title,
        coalesce(v_cat || '. ', '') || coalesce('Quantity ' || v_qty || '. ', '') || 'Open your leads to send a quote.', null);
      v_sent := array['app'];
    end if;
    v_ext := array(select c from unnest(v_now) c where c <> 'app');
    if cardinality(v_ext) > 0 then
      -- The vendor's own name, Cosora's category and a number: nothing the buyer wrote.
      v_res := public.notify_deliver(m.vendor_id, 'lead_alert',
        jsonb_build_object(
          'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = m.vendor_id),
          'category', coalesce(v_cat, 'Uncategorised'), 'quantity', coalesce(v_qty, 'not given')),
        'lead_alert:' || p_rfq || ':' || m.vendor_id, v_ext);
      v_sent := v_sent || array(select t.k from jsonb_each_text(coalesce(v_res -> 'channels', '{}'::jsonb)) as t(k, v)
                                 where t.v = 'queued' order by t.k);
    end if;
    if cardinality(v_sent) > 0 then
      update admin.lead_alerts set channels = v_sent where id = v_id;
    end if;
  end loop;
  if n > 0 then
    update admin.lead_alert_runs set alerted = alerted + n where rfq_id = p_rfq;
  end if;
  return n;
end
$function$;

-- ── Kept fresh: every hour, and once now ───────────────────────────────────────────────────────────────────
select cron.schedule('vendor-standing-refresh', '7 * * * *', 'select admin.refresh_vendor_standing();');
select admin.refresh_vendor_standing();

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from admin.vendor_standing) <> (select count(*) from public.vendor_profiles) then
    raise exception 'self-check: a seller has no Standing';
  end if;
  if has_table_privilege('authenticated', 'admin.vendor_standing', 'select')
     or has_function_privilege('authenticated', 'admin.refresh_vendor_standing()', 'execute')
     or has_function_privilege('authenticated', 'admin.vendor_standing_parts(uuid)', 'execute') then
    raise exception 'self-check: clients can reach Standing''s parts';
  end if;
  if has_function_privilege('anon', 'public.vendor_standing(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.vendor_standing(uuid)', 'execute')
     or has_function_privilege('anon', 'public.quote_order_for_rfq(uuid)', 'execute') then
    raise exception 'self-check: the public helpers have the wrong grants';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('top_vendors', 'new_brand_suggestions') and not p.prosecdef)
     or not has_function_privilege('anon', 'public.top_vendors(integer)', 'execute') then
    raise exception 'self-check: the seller lists must run as definer and stay open to visitors';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where (n.nspname, p.proname) in (('public', 'top_vendors'), ('public', 'new_brand_suggestions'),
                     ('public', 'search_suggestions'), ('public', 'match_rfq_vendors'), ('admin', 'lead_alert_fanout'))
                and (p.prosrc ilike '%profile\_score%' or p.prosrc not ilike '%vendor\_standing(%')) then
    raise exception 'self-check: a seller ranking still reads profile score';
  end if;
  if not exists (select 1 from cron.job where jobname = 'vendor-standing-refresh' and active) then
    raise exception 'self-check: the hourly refresh is not scheduled';
  end if;
end
$check$;
