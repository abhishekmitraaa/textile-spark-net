-- Lead ranking, set-based (Seller Home audit SH-076, 2026-11-16).
--
-- match_vendor_rfqs() runs on every Seller Home, /leads, /quotes and /overseas-leads load. For each open requirement
-- it called the plpgsql admin.rfq_fit() (six or more queries, and a scan of the seller's live listings per answer),
-- chat_blocked_between() and rfq_category_is_open(), all before LIMIT 200: about 0.16 ms a requirement, so most of a
-- second of database time per call at 5,000 requirements. "Anything on every page view must be set-based."
--
-- Now the seller's side is read once (capabilities, location history, capacity, the values its live listings carry
-- under each matched question, its blocks) and every requirement is scored in one query. THE RESULT IS THE SAME: the
-- same rows, the same scores to the last bit, the same order. scripts/seller-home/lead_ranking_equivalence.sql compares
-- this function with the one it replaces, and admin.rfq_fit_set() with admin.rfq_fit(), over 5,000 generated
-- requirements and ten sellers.
--
-- admin.rfq_fit() stays: it is the reference the harness compares against, and scripts/ranking/fit_match.sql tests the
-- Fit rules through it. A change to Fit changes both, and documentation/ranking.md.

-- 1. Fit for many requirements at once. Each part is admin.rfq_fit()'s, rule for rule:
--    answers   the weight of the matched questions the seller's live listings also answer, over the weight of those
--              they answer at all (0.5 when none); weights are added in the answers' own order, as the loop did, so
--              the floating-point sums are identical;
--    location  the buyer's state against the seller's state and served states as they were when the requirement was
--              posted (overseas: whether the seller is export-ready);
--    scale     monthly capacity in the category family's unit against the quantity.
create or replace function admin.rfq_fit_set(p_vendor uuid, p_rfqs uuid[])
returns table (rfq_id uuid, attr_part double precision, loc_part double precision, scale_part double precision)
language sql
stable
security definer
set search_path = ''
as $$
  with r as materialized (
    select rq.id, rq.attributes, rq.overseas, rq.buyer_id, rq.category_id, rq.quantity, rq.created_at
      from public.rfqs rq
     where rq.id = any (p_rfqs)
  ),
  caps as materialized (
    select coalesce((select vp.capabilities from public.vendor_profiles vp where vp.id = p_vendor), '{}'::text[]) as caps
  ),
  hist as materialized (
    select h.id, h.state_code, h.served_states, h.valid_from
      from admin.vendor_location_history h
     where h.vendor_id = p_vendor
  ),
  -- A requirement question that means a listing question, and what it weighs.
  defs as materialized (
    select ad.key, max(ad.match_key) as match_key, max(ad.match_weight)::double precision as w
      from public.attribute_definitions ad
     where ad.form = 'requirement' and ad.match_weight > 0 and ad.match_key is not null
     group by ad.key
  ),
  -- What the seller's live listings say under each of those listing questions: every listing read once, its answers
  -- spread out by question (a listing's "colours" also counts under "colors"), plus the listing's own columns.
  -- admin.fit_values()'s rule is written inline here and below (text and numbers, trimmed, lower case, blanks
  -- dropped): as a function it can't be inlined, and one call per answer was most of this function's time.
  mine as materialized (
    select s.match_key, array_agg(distinct s.x) as vals
      from public.products p
      cross join lateral (
        select mk.match_key, lower(btrim(e.x)) as x
          from jsonb_each(case when jsonb_typeof(p.attributes) = 'object' then p.attributes else '{}'::jsonb end) at
          cross join lateral (values (at.key), (case when at.key = 'colours' then 'colors' end)) mk(match_key)
          cross join lateral (
            select at.value #>> '{}' as x where jsonb_typeof(at.value) in ('string', 'number')
            union all
            select el #>> '{}'
              from jsonb_array_elements(case when jsonb_typeof(at.value) = 'array' then at.value else '[]'::jsonb end) el
             where jsonb_typeof(el) in ('string', 'number')
          ) e
         where mk.match_key is not null
        union all select 'fabric', lower(btrim(p.fabric))
        union all select 'gsm', lower(btrim(p.gsm))
        union all select 'pattern', lower(btrim(u)) from unnest(p.pattern) u
        union all select 'sizes', lower(btrim(u)) from unnest(p.sizes) u
      ) s
     where p.vendor_id = p_vendor and p.status = 'live'
       and coalesce(s.x, '') <> ''
       and s.match_key in (select d.match_key from defs d)
     group by s.match_key
  ),
  -- A buyer's answer counts when it holds a value and the seller's listings answer that question at all; it is a hit
  -- when they share a value.
  ans as (
    select r.id, j.ord, d.w, t.hit
      from r
      cross join lateral jsonb_each(coalesce(r.attributes, '{}'::jsonb)) with ordinality as j(key, value, ord)
      join defs d on d.key = j.key
      join mine m on m.match_key = d.match_key
      cross join lateral (
        select count(*) > 0 as has, coalesce(bool_or(lower(btrim(e.x)) = any (m.vals)), false) as hit
          from (select j.value #>> '{}' as x where jsonb_typeof(j.value) in ('string', 'number')
                union all
                select el #>> '{}'
                  from jsonb_array_elements(case when jsonb_typeof(j.value) = 'array' then j.value else '[]'::jsonb end) el
                 where jsonb_typeof(el) in ('string', 'number')) e
         where btrim(e.x) <> ''
      ) t
     where t.has
  ),
  attr as (
    select a.id,
           sum(a.w order by a.ord) as den,
           coalesce(sum(a.w order by a.ord) filter (where a.hit), 0) as num
      from ans a
     group by a.id
  ),
  -- A category's family and its unit: once per category, not once per requirement.
  roots as materialized (
    select c.category_id, c.root, admin.category_root_unit(c.root) as unit
      from (select d.category_id, public.category_root_of(d.category_id) as root
              from (select distinct r.category_id from r where r.category_id is not null) d) c
  )
  select
    r.id,
    (case when a.den > 0 then a.num / a.den else 0.5 end)::double precision,
    (case
       when r.overseas then case when 'export_ready' = any (c.caps) then 1 else 0.5 end
       else case
         when bp.state_code is null
              or (h.state_code is null and cardinality(coalesce(h.served_states, '{}'::text[])) = 0) then 0.5
         when bp.state_code = h.state_code then 1
         when bp.state_code = any (coalesce(h.served_states, '{}'::text[])) then 0.8
         when cardinality(coalesce(h.served_states, '{}'::text[])) > 0 then 0
         else 0.25
       end
     end)::double precision,
    (case
       when ro.unit is not null and vc.monthly_capacity is not null and vc.unit = ro.unit and coalesce(r.quantity, 0) > 0
         then least(1, vc.monthly_capacity / r.quantity)::double precision
       else 0.5
     end)::double precision
  from r
  cross join caps c
  left join attr a on a.id = r.id
  left join public.buyer_profiles bp on bp.id = r.buyer_id
  -- Where the seller was when the requirement was posted.
  left join lateral (
    select hh.state_code, hh.served_states
      from hist hh
     where hh.valid_from <= r.created_at
     order by hh.valid_from desc, hh.id desc
     limit 1
  ) h on true
  left join roots ro on ro.category_id = r.category_id
  left join public.vendor_capacity vc on vc.vendor_id = p_vendor and vc.category_root = ro.root
$$;

revoke all on function admin.rfq_fit_set(uuid, uuid[]) from public, anon, authenticated;

-- 2. The feed. Same signature, same output; nothing is called per requirement any more.
create or replace function public.match_vendor_rfqs(p_vendor_id uuid, match_count integer default 200)
returns table(rfq_id uuid, similarity double precision, category_match boolean, score double precision, near boolean)
language plpgsql
stable
security definer
set search_path = public, extensions
as $function$
declare
  v_tier text := admin.vendor_overseas_tier(p_vendor_id);
begin
  if auth.uid() is not null and p_vendor_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with v as materialized (
    select vp.catalog_embedding as emb,
           (select array_agg(distinct p.category_id)
              from public.products p
             where p.vendor_id = vp.id
               and p.status = 'live'
               and p.category_id is not null) as cat_ids,
           -- 2026-10-17: "Others (custom)" is every seller's category (one with a live listing).
           -- The rule of rfq_category_is_open, read once.
           coalesce((select array_agg(c.id) from public.categories c
                      where c.name = 'Others (Custom)' and c.parent_id is null), '{}'::uuid[]) as open_ids
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
  ),
  -- Everyone this seller blocked or was blocked by (20261018160200): the rule of chat_blocked_between, read once.
  peers as materialized (
    select array_agg(case when b.blocker_id = p_vendor_id then b.blocked_id else b.blocker_id end) as ids
      from public.chat_blocks b
     where b.unblocked_at is null
       and (b.blocker_id = p_vendor_id or b.blocked_id = p_vendor_id)
  ),
  pool as materialized (
    select r.id, r.category_id, r.overseas,
           case when v.emb is not null and r.embedding is not null
                then (1 - (r.embedding <=> v.emb))::double precision
           end as similarity
    from public.rfqs r cross join v
    where r.status = 'active'
      and r.vendor_id is null
      -- Not past its deadline (2026-10-19).
      and (r.expires_at is null or r.expires_at > now())
      -- Not a buyer who blocked this seller, or whom the seller blocked.
      and not coalesce(r.buyer_id = any (((select p.ids from peers p))::uuid[]), false)
      -- Overseas requirements are Gold's and VIP's (P7), or a vendor's who already quoted.
      -- overseas_rfq_visible's rule, inline (it is tested on every row).
      and (not r.overseas
           or v_tier = 'vip'
           or (v_tier = 'gold' and (r.overseas_vip_until is null or now() >= r.overseas_vip_until))
           or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor_id))
  ),
  fit as materialized (
    select f.rfq_id, f.attr_part, f.loc_part, f.scale_part
      from admin.rfq_fit_set(p_vendor_id, coalesce((select array_agg(pool.id) from pool), '{}'::uuid[])) f
  ),
  scored as (
    select
      pool.id as rfq_id,
      pool.similarity,
      coalesce(pool.category_id is not null
                 and (pool.category_id = any(v.cat_ids)
                      or (pool.category_id = any(v.open_ids) and v.cat_ids is not null)), false) as category_match,
      f.attr_part, f.loc_part, f.scale_part, pool.overseas
    from pool cross join v
    join fit f on f.rfq_id = pool.id
  )
  select
    s.rfq_id,
    s.similarity,
    s.category_match,
    (0.45 * coalesce(s.similarity, 0)
       + 0.20 * s.category_match::int
       + 0.15 * s.attr_part
       + 0.12 * s.loc_part
       + 0.08 * s.scale_part)::double precision as score,
    -- "Near you": the buyer's profile state is the vendor's, or one it serves.
    (s.loc_part >= 0.8 and not s.overseas) as near
  from scored s
  order by score desc, s.similarity desc nulls last, s.rfq_id
  limit coalesce(match_count, 200);
end
$function$;

-- 3. Self-check.
do $$
declare
  src text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'admin' and p.proname = 'rfq_fit_set' and p.prosecdef) then
    raise exception 'admin.rfq_fit_set must exist and be SECURITY DEFINER';
  end if;
  if has_function_privilege('authenticated', 'admin.rfq_fit_set(uuid, uuid[])', 'execute')
     or has_function_privilege('anon', 'admin.rfq_fit_set(uuid, uuid[])', 'execute') then
    raise exception 'admin.rfq_fit_set must not be executable by browser roles';
  end if;
  select p.prosrc into src from pg_proc p where p.oid = 'public.match_vendor_rfqs(uuid, integer)'::regprocedure;
  if src ~ 'admin\.rfq_fit\(' or src ~ 'chat_blocked_between\(' or src ~ 'rfq_category_is_open\(' then
    raise exception 'match_vendor_rfqs still calls a function per requirement';
  end if;
  if not has_function_privilege('authenticated', 'public.match_vendor_rfqs(uuid, integer)', 'execute') then
    raise exception 'match_vendor_rfqs must stay callable by signed-in sellers';
  end if;
end $$;
