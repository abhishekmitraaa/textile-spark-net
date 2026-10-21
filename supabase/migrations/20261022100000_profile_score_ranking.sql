-- Profile score ranks sellers for buyers, and the CSV import is off (2026-10-22).
-- Mitra: "profile score should be used to rank the vendor for suggesting to the buyer side and related things like
-- rfq discovery and brand/vendor discovery, stop the CSV import"; "not above paid plan"; "just these 4".
--
--   1 The database computes vendor_profiles.profile_score. It was the seller's browser that worked it out and wrote
--     it back, which was harmless while only the seller saw it; a number that ranks a seller can't be one they set.
--     public.vendor_profile_score_of() is the dashboard's formula (src/lib/queries/vendorDashboard.ts,
--     PROFILE_SCORE_WEIGHTS, 15 checks summing to 100). It is recomputed on every change to the profile (a value the
--     client sends is replaced) and after a listing or a quote is added, removed or changes status or owner.
--   2 Sellers are ranked paid plan first, then by the profile score: Recommended Premium Brands (top_vendors), brand
--     suggestions (new_brand_suggestions, then recency), and sellers in search suggestions (then followers).
--   3 A buyer's requirement: match_rfq_vendors puts paid sellers first, then the match with the profile score as a
--     smaller push (0.1 at most, against a match of up to 1); lead alerts (admin.lead_alert_fanout) keep VIP first
--     and then use the same push between matches. The score each returns or records stays the match alone.
--   4 The CSV import is off: the bulk_import switch, EXECUTE on import_products, and the plans' catalogue lines.
--
-- Pre-checks stop the file if any function it replaces or patches isn't the version it was written against.

do $pin$
declare
  v_pins text[][] := array[
    ['public.top_vendors(integer)',                 '01386528bff80a9dfa473f10b56a33ae'],
    ['public.new_brand_suggestions(integer)',       'fdca2766954cbcebc9e154e969f4ec34'],
    ['public.search_suggestions(text,integer)',     '47a3577ca8752a0a78c296ce21ee348a'],
    ['public.match_rfq_vendors(uuid,integer)',      '7013b963b0ab9495efe90d203b72227b'],
    ['admin.lead_alert_fanout(uuid)',               '6aedb0e852d2405a83ba8927aebf0e1a'],
    ['public.import_products(jsonb,text,boolean)',  'd795e7cfc660fb76a9f670bb06871204']];
  v_i int;
begin
  for v_i in 1 .. array_length(v_pins, 1) loop
    if md5(replace((select p.prosrc from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure), chr(13), '')) <> v_pins[v_i][2] then
      raise exception 'pre-check: % is not the version this migration was written against', v_pins[v_i][1];
    end if;
  end loop;
  if to_regprocedure('public.vendor_profile_score_of(public.vendor_profiles)') is not null then
    raise exception 'pre-check: vendor_profile_score_of already exists';
  end if;
end
$pin$;

-- ── 1 The score ────────────────────────────────────────────────────────────────────────────────────────────
-- The dashboard's 15 checks, point for point. A text field counts when it has something other than spaces.
create function public.vendor_profile_score_of(v public.vendor_profiles)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  with c as (
    select (select count(*) from public.products p where p.vendor_id = v.id)                         as total,
           (select count(*) from public.products p where p.vendor_id = v.id and p.status = 'live')   as live,
           (select count(*) from public.quotes q where q.vendor_id = v.id)                           as quotes
  )
  select least(100,
      (case when btrim(coalesce(v.phone, ''), E' \t\r\n') <> '' then 8 else 0 end)                -- contact phone
    + (case when char_length(btrim(coalesce(v.about, ''), E' \t\r\n')) > 10 then 8 else 0 end)    -- About Us
    + (case when c.live >= 1 then 7 else 0 end)                                                   -- a live listing
    + (case when coalesce(cardinality(v.category), 0) > 0 then 7 else 0 end)                      -- categories
    + (case when coalesce(cardinality(v.office_photos), 0) >= 5 then 7 else 0 end)                -- 5 premises photos
    + (case when c.total >= 10 then 10 else 0 end)                                                -- 10 listings
    + (case when btrim(coalesce(v.owner_email, ''), E' \t\r\n') <> '' then 7 else 0 end)          -- business email
    + (case when coalesce(v.reviews_count, 0) >= 20 then 9 else 0 end)                            -- 20 reviews
    + (case when jsonb_typeof(v.social) = 'object' and exists (
               select 1 from jsonb_each(v.social) e, jsonb_array_elements(
                        case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) u
                where jsonb_typeof(u) = 'string' and btrim(u #>> '{}', E' \t\r\n') <> '')
            then 6 else 0 end)                                                                    -- a social link
    + (case when btrim(coalesce(v.website, ''), E' \t\r\n') <> '' then 7 else 0 end)              -- website
    + (case when c.quotes >= 2 then 7 else 0 end)                                                 -- 2 quotes sent
    + (case when v.year_established is not null then 5 else 0 end)                                -- year established
    + (case when btrim(coalesce(v.employee_count, ''), E' \t\r\n') <> '' then 4 else 0 end)       -- team size
    + (case when btrim(coalesce(v.annual_turnover, ''), E' \t\r\n') <> '' then 4 else 0 end)      -- turnover
    + (case when coalesce(cardinality(v.capacity), 0) > 0 then 4 else 0 end))::integer            -- capacity
  from c
$function$;
revoke all on function public.vendor_profile_score_of(public.vendor_profiles) from public, anon, authenticated;

-- Every change to a profile row: the score is the computed one, whatever the client sent. Named to run after the
-- other BEFORE triggers on vendor_profiles, so it scores the row they leave.
create function admin.vendor_profiles_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.profile_score := public.vendor_profile_score_of(new);
  return new;
end
$function$;
revoke all on function admin.vendor_profiles_score() from public, anon, authenticated;

create trigger trg_vendor_profiles_zz_profile_score
  before insert or update on public.vendor_profiles
  for each row execute function admin.vendor_profiles_score();

-- A listing or a quote changes the counts: touch the seller's row so the trigger above scores it again.
create function admin.vendor_score_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[case when tg_op <> 'INSERT' then old.vendor_id end,
                              case when tg_op <> 'DELETE' then new.vendor_id end], null);
  update public.vendor_profiles set profile_score = profile_score where id = any (v_ids);
  return null;
end
$function$;
revoke all on function admin.vendor_score_refresh() from public, anon, authenticated;

create trigger trg_products_vendor_score
  after insert or delete or update of status, vendor_id on public.products
  for each row execute function admin.vendor_score_refresh();
create trigger trg_quotes_vendor_score
  after insert or delete or update of vendor_id on public.quotes
  for each row execute function admin.vendor_score_refresh();

-- Every seller scored now.
update public.vendor_profiles set profile_score = profile_score;

-- ── 2 and 3 The rankings ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.top_vendors(p_limit integer DEFAULT 4)
 RETURNS TABLE(id uuid, brand_name text, city text, rating_avg numeric, reviews_count integer, is_verified boolean, plan_expires_at timestamp with time zone, ad_verified_until timestamp with time zone, image_url text, live_products integer)
 LANGUAGE sql
 STABLE
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
   -- Paid plan first, then the profile score (20261022100000), then rating.
   order by (v.plan_expires_at is not null and v.plan_expires_at > now()) desc,
            coalesce(v.profile_score, 0) desc,
            coalesce(v.rating_avg, 0) desc, coalesce(v.reviews_count, 0) desc, v.id
   limit least(greatest(coalesce(p_limit, 4), 1), 12);
$function$;

CREATE OR REPLACE FUNCTION public.new_brand_suggestions(p_limit integer DEFAULT 12)
 RETURNS TABLE(vendor_id uuid, brand_name text, city text, is_verified boolean, followers_count integer, logo_url text, live_count integer, top_products jsonb)
 LANGUAGE sql
 STABLE
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
           (v.plan_expires_at is not null and v.plan_expires_at > now()) as paid, coalesce(v.profile_score, 0) as profile_score
      from sellers s
      join public.vendor_profiles v on v.id = s.vendor_id, me
     where s.vendor_id is distinct from me.uid
       and not exists (select 1 from public.follows f where f.follower_id = me.uid and f.vendor_id = s.vendor_id)
     -- Paid plan first, then the profile score (20261022100000), then the most recent pictures.
     order by paid desc, profile_score desc, s.last_pictured_at desc, s.vendor_id
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
   order by pk.paid desc, pk.profile_score desc, pk.last_pictured_at desc, pk.vendor_id
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
             coalesce(vp.profile_score, 0) as profile_score,
             (select count(*)::int from public.follows f where f.vendor_id = vp.id) as followers
      from public.vendor_profiles vp, n
      where n.qn is not null
        and vp.brand_name is not null
        and vp.brand_name ilike '%' || n.qn || '%'
    ) v
    -- Paid plan first, then the profile score (20261022100000), then followers.
    order by v.paid desc, v.profile_score desc, v.followers desc, v.brand_name
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
  -- Paid plan first; then the match, with the profile score as a smaller push (up to 0.1 against a match
  -- of up to 1), so a close match with a thin profile still beats a complete profile that sells something
  -- else (20261022100000). The score returned stays the match alone.
  order by (vp.plan_expires_at is not null and vp.plan_expires_at > now()) desc,
           (0.7 * coalesce(vec.similarity, 0) + 0.3 * (cat.vendor_id is not null)::int
              + 0.1 * coalesce(vp.profile_score, 0) / 100.0) desc,
           similarity desc nulls last, 1
  limit coalesce(match_count, 20);
$function$;

-- Lead alerts: VIP first as before; then the match with the same profile push; between equals the bigger plan.
do $patch$
declare
  v_def text := pg_get_functiondef('admin.lead_alert_fanout(uuid)'::regprocedure);
  v_old text := '     order by coalesce((p.limits ->> ''lead_alert_priority'')::boolean, false) desc, x.score desc, p.sort_order desc, x.vendor_id';
  v_new text := '     order by coalesce((p.limits ->> ''lead_alert_priority'')::boolean, false) desc,' || E'\n'
             || '              x.score + 0.1 * coalesce((select vp.profile_score from public.vendor_profiles vp where vp.id = x.vendor_id), 0) / 100.0 desc,' || E'\n'
             || '              p.sort_order desc, x.vendor_id';
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'lead_alert_fanout no longer has the ordering line this patch replaces';
  end if;
  execute replace(v_def, v_old, v_new);
end
$patch$;

-- ── 4 The CSV import is off ───────────────────────────────────────────────────────────────────────────────
update public.feature_flags set enabled = false where key = 'bulk_import';
revoke execute on function public.import_products(jsonb, text, boolean) from public, anon, authenticated;
update public.subscription_plans
   set display = jsonb_set(display, '{catalog}', to_jsonb(case id
         when 'silver' then 'PDF catalogue'
         when 'gold'   then 'PDF catalogue; done-for-you catalogue coming soon'
         when 'vip'    then 'PDF catalogue; AI catalogue coming soon' end))
 where id in ('silver', 'gold', 'vip');

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
begin
  if exists (select 1 from public.vendor_profiles v where v.profile_score is distinct from public.vendor_profile_score_of(v)) then
    raise exception 'self-check: a seller''s stored score isn''t the computed one';
  end if;
  if (select count(*) from pg_trigger where tgname in ('trg_vendor_profiles_zz_profile_score', 'trg_products_vendor_score', 'trg_quotes_vendor_score')) <> 3 then
    raise exception 'self-check: the score triggers are not all there';
  end if;
  if position('profile_score' in pg_get_functiondef('public.top_vendors(integer)'::regprocedure)) = 0
     or position('profile_score' in pg_get_functiondef('public.new_brand_suggestions(integer)'::regprocedure)) = 0
     or position('profile_score' in pg_get_functiondef('public.search_suggestions(text,integer)'::regprocedure)) = 0
     or position('profile_score' in pg_get_functiondef('public.match_rfq_vendors(uuid,integer)'::regprocedure)) = 0
     or position('profile_score' in pg_get_functiondef('admin.lead_alert_fanout(uuid)'::regprocedure)) = 0 then
    raise exception 'self-check: a ranking doesn''t use the profile score';
  end if;
  if has_function_privilege('authenticated', 'public.import_products(jsonb,text,boolean)', 'execute') then
    raise exception 'self-check: import_products is still callable';
  end if;
  if exists (select 1 from public.subscription_plans where display ->> 'catalog' ilike '%bulk import%')
     or exists (select 1 from public.feature_flags where key = 'bulk_import' and enabled) then
    raise exception 'self-check: bulk import is still offered';
  end if;
end
$check$;
