-- Seller Home audit SH-076: the set-based lead ranking returns what the per-row one did, and is fast.
-- (documentation/seller-home-high-fixes-plan-2026-11-16.md, Task 6.)
--
--   fit_parts_equal     admin.rfq_fit_set() gives admin.rfq_fit()'s three parts, exactly, for every open requirement
--   same_leads          match_vendor_rfqs() returns the rows, scores and order of the function it replaced
--                       (kept below as pg_temp.match_vendor_rfqs_old), for every requirement and for the first 200
--   fast_enough         one call over 5,000+ open requirements takes under 250 ms (the old one is printed beside it)
--
-- The local database has no requirement answers or embeddings, so the file makes its own: 5,000 open requirements with
-- answers, embeddings, categories, quantities, overseas flags and posting dates, and ten sellers (eight with live
-- listings, one of them with 120, one with capacity only, one with nothing) given listing attributes, location
-- changes, capacity, blocks, quotes and Gold / VIP plans. Fixtures are written with session_replication_role = replica (no triggers: no lead-alert
-- fan-out, no guards). Everything is in one transaction that rolls back.
--
--   docker exec -i supabase_db_localstack psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < scripts/seller-home/lead_ranking_equivalence.sql

begin;
set local session_replication_role = replica;

-- The function as it was before 20261116110100, word for word.
create function pg_temp.match_vendor_rfqs_old(p_vendor_id uuid, match_count integer default 200)
returns table(rfq_id uuid, similarity double precision, category_match boolean, score double precision, near boolean)
language plpgsql stable
set search_path = public, extensions
as $old$
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
               and p.category_id is not null) as cat_ids
    from public.vendor_profiles vp
    where vp.id = p_vendor_id
  ),
  pool as (
    select r.id, r.embedding, r.category_id, r.overseas
    from public.rfqs r
    where r.status = 'active'
      and r.vendor_id is null
      and (r.expires_at is null or r.expires_at > now())
      and not public.chat_blocked_between(r.buyer_id, p_vendor_id)
      and (not r.overseas
           or v_tier = 'vip'
           or (v_tier = 'gold' and (r.overseas_vip_until is null or now() >= r.overseas_vip_until))
           or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor_id))
  ),
  scored as (
    select
      pool.id as rfq_id,
      case when v.emb is not null and pool.embedding is not null
           then (1 - (pool.embedding <=> v.emb))::double precision
      end as similarity,
      coalesce(pool.category_id is not null
                 and (pool.category_id = any(v.cat_ids)
                      or (public.rfq_category_is_open(pool.category_id) and v.cat_ids is not null)), false) as category_match,
      f.attr_part, f.loc_part, f.scale_part, pool.overseas
    from pool cross join v
    cross join lateral admin.rfq_fit(p_vendor_id, pool.id) f
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
    (s.loc_part >= 0.8 and not s.overseas) as near
  from scored s
  order by score desc, s.similarity desc nulls last, s.rfq_id
  limit coalesce(match_count, 200);
end
$old$;

-- A word, a list or a number a form could hold, in mixed case and spacing.
create function pg_temp.word() returns text language sql volatile as $$
  select (array['Cotton', ' polyester ', 'RED', 'blue', 'M', 'L', 'XL', '180', 'Printed', 'solid', 'Linen', 'green'])[1 + floor(random() * 12)::int]
$$;
create function pg_temp.answer() returns jsonb language sql volatile as $$
  select case floor(random() * 5)::int
           when 0 then to_jsonb(pg_temp.word())
           when 1 then jsonb_build_array(pg_temp.word(), pg_temp.word())
           when 2 then jsonb_build_array(pg_temp.word(), pg_temp.word(), pg_temp.word())
           when 3 then to_jsonb((array[180, 200, 240])[1 + floor(random() * 3)::int])
           else jsonb_build_array()
         end
$$;
create function pg_temp.vec(seed int) returns extensions.halfvec language sql volatile as $$
  select (array_agg((random() * 2 - 1)::real))::extensions.halfvec(1536) from generate_series(1, 1536) g where seed is not null
$$;

create temp table hx_vendors (id uuid primary key, kind text) on commit drop;
create temp table hx_keys on commit drop as
  select ad.key, max(ad.match_key) as mk from public.attribute_definitions ad
   where ad.form = 'requirement' and ad.match_weight > 0 and ad.match_key is not null group by ad.key;

do $fixtures$
declare
  buyers uuid[];
  cats uuid[];
  states text[];
  keys text[];
  v record;
  n int := 0;
  g int;
  attrs jsonb;
  made uuid;
begin
  insert into hx_vendors
  select t.id, 'listings' from (
    select vp.id, (select count(*) from public.products p where p.vendor_id = vp.id and p.status = 'live') as live
      from public.vendor_profiles vp) t
   where t.live > 0 order by t.live desc, t.id limit 8;
  insert into hx_vendors
  select vp.id, 'capacity only' from public.vendor_profiles vp
   where not exists (select 1 from public.products p where p.vendor_id = vp.id)
     and vp.id not in (select id from hx_vendors) order by vp.id limit 1;
  insert into hx_vendors
  select vp.id, 'bare' from public.vendor_profiles vp
   where not exists (select 1 from public.products p where p.vendor_id = vp.id)
     and vp.id not in (select id from hx_vendors) order by vp.id desc limit 1;
  if (select count(*) from hx_vendors) < 10 then raise exception 'setup: need 10 sellers, found %', (select count(*) from hx_vendors); end if;

  select array_agg(code) into states from public.india_states;
  select array_agg(key) into keys from hx_keys;
  select array_agg(id) into cats from public.categories;
  select array_agg(id) into buyers from (select bp.id from public.buyer_profiles bp
    where bp.id not in (select id from hx_vendors) order by bp.id limit 300) b;
  if cardinality(buyers) < 50 then raise exception 'setup: need buyers'; end if;
  -- Where buyers are: most in a state, some unknown.
  update public.buyer_profiles bp
     set state_code = case when random() < 0.75 then states[1 + floor(random() * 6)::int] end
   where bp.id = any (buyers);

  for v in select hv.id, hv.kind, row_number() over (order by hv.id) as i from hx_vendors hv loop
    -- Listings: answers under the keys the requirement form matches on, and the listing's own columns.
    update public.products p
       set attributes = coalesce((select jsonb_object_agg(k.mk, pg_temp.answer())
                                    from (select distinct mk from hx_keys) k where random() < 0.6 and p.id is not null), '{}'::jsonb)
                        || case when random() < 0.3 then jsonb_build_object('colours', pg_temp.answer()) else '{}'::jsonb end,
           fabric = case when random() < 0.6 then pg_temp.word() end,
           gsm = case when random() < 0.5 then (array['180', ' 200', '240 '])[1 + floor(random() * 3)::int] end,
           pattern = case when random() < 0.5 then array[pg_temp.word(), pg_temp.word()] end,
           sizes = case when random() < 0.5 then array[pg_temp.word(), ' m '] end
     where p.vendor_id = v.id;
    -- One seller with many listings: reading a seller's listings must not cost a pass per question.
    if v.i = 3 then
      insert into public.products (vendor_id, name, status, price_value, attributes, fabric, gsm, pattern, sizes)
      select v.id, 'hx listing ' || gs.n, 'live', 100,
             coalesce((select jsonb_object_agg(k.mk, pg_temp.answer())
                         from (select distinct mk from hx_keys) k where random() < 0.4 and gs.n is not null), '{}'::jsonb),
             case when gs.n % 3 = 0 then pg_temp.word() end, case when gs.n % 4 = 0 then '180' end,
             case when gs.n % 5 = 0 then array[pg_temp.word()] end, case when gs.n % 6 = 0 then array[pg_temp.word(), 'XL'] end
        from generate_series(1, 120) gs(n);
    end if;
    -- Location now and as it was: two moves in the last month.
    update public.vendor_profiles vp
       set capabilities = case when v.i % 2 = 0 then array['export_ready'] else '{}'::text[] end,
           catalog_embedding = case when v.i % 3 <> 0 then pg_temp.vec(v.i::int) end
     where vp.id = v.id;
    if v.i % 4 <> 0 then
      insert into admin.vendor_location_history (vendor_id, state_code, served_states, valid_from) values
        (v.id, states[1 + (v.i % 6)::int], array[states[1 + ((v.i + 1) % 6)::int], states[1 + ((v.i + 2) % 6)::int]], now() - interval '20 days'),
        (v.id, case when v.i % 5 = 0 then null else states[1 + ((v.i + 3) % 6)::int] end, '{}', now() - interval '9 days');
    end if;
    -- Capacity: a matching unit, another matching unit, and one in the wrong unit.
    if v.kind <> 'bare' then
      insert into public.vendor_capacity (vendor_id, category_root, monthly_capacity, unit) values
        (v.id, 'apparel-home', 4000, 'pieces'), (v.id, 'raw-materials', 1500, 'metres'), (v.id, 'chemicals-dyes', 900, 'pieces')
      on conflict (vendor_id, category_root) do update set monthly_capacity = excluded.monthly_capacity, unit = excluded.unit;
    end if;
    -- Plans: one Gold, one VIP.
    if v.i in (1, 2) then
      insert into public.vendor_subscriptions (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end)
      values (v.id, case v.i when 1 then 'gold' else 'vip' end, 'monthly', 'active', now() - interval '1 day', now() + interval '29 days')
      on conflict (vendor_id) do update set plan_id = excluded.plan_id, status = 'active', scheduled_plan_id = null,
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end;
    end if;
    -- Blocks, both ways, and one that was lifted.
    insert into public.chat_blocks (blocker_id, blocked_id, unblocked_at) values
      (v.id, buyers[v.i::int], null), (buyers[v.i::int + 20], v.id, null), (v.id, buyers[v.i::int + 40], now())
    on conflict (blocker_id, blocked_id) do update set unblocked_at = excluded.unblocked_at;
  end loop;

  -- 5,000 open requirements.
  for g in 1..5000 loop
    select coalesce(jsonb_object_agg(k, pg_temp.answer()), '{}'::jsonb) into attrs
      from unnest(keys) k where random() < 0.25;
    insert into public.rfqs (buyer_id, title, category_id, quantity, status, vendor_id, attributes, overseas, overseas_vip_until,
                             expires_at, created_at, embedding)
    values (
      buyers[1 + floor(random() * cardinality(buyers))::int],
      'hx lead ' || g,
      case when random() < 0.1 then null else cats[1 + floor(random() * cardinality(cats))::int] end,
      case floor(random() * 6)::int when 0 then null when 1 then 0 else 1 + floor(random() * 20000)::int end,
      'active', null,
      case when g % 11 = 0 then '{}'::jsonb else attrs end,
      random() < 0.1,
      case floor(random() * 3)::int when 0 then null when 1 then now() - interval '1 hour' else now() + interval '1 day' end,
      case when random() < 0.05 then null else now() + interval '5 days' end,
      now() - random() * interval '30 days',
      case when g % 5 = 0 then null else pg_temp.vec(g) end)
    returning id into made;
    -- A few overseas requirements already quoted by a seller with no plan for them.
    if g % 97 = 0 then
      update public.rfqs set overseas = true, overseas_vip_until = now() + interval '1 day' where id = made;
      insert into public.quotes (rfq_id, vendor_id, price_per_unit, status)
      select made, hv.id, 100, 'pending' from hx_vendors hv order by hv.id offset 3 limit 1;
    end if;
    n := n + 1;
  end loop;
  raise notice 'fixtures: % requirements, 10 sellers', n;
end
$fixtures$;

analyze public.rfqs;

do $checks$
declare
  v record;
  open_ids uuid[];
  bad int;
  total int := 0;
  t0 timestamptz;
  old_ms numeric;
  new_ms numeric;
  slowest numeric := 0;
  rows_new int;
begin
  create temp table hx_old (rfq_id uuid, similarity double precision, category_match boolean, score double precision, near boolean, n bigint) on commit drop;
  select array_agg(r.id) into open_ids from public.rfqs r
   where r.status = 'active' and r.vendor_id is null and (r.expires_at is null or r.expires_at > now());

  for v in select hv.id, hv.kind, admin.vendor_overseas_tier(hv.id) as tier from hx_vendors hv order by hv.id loop
    -- fit_parts_equal
    select count(*) into bad
      from unnest(open_ids) r(id)
      cross join lateral admin.rfq_fit(v.id, r.id) o
      left join admin.rfq_fit_set(v.id, open_ids) s on s.rfq_id = r.id
     where s.rfq_id is null
        or o.attr_part is distinct from s.attr_part
        or o.loc_part is distinct from s.loc_part
        or o.scale_part is distinct from s.scale_part;
    if bad <> 0 then
      raise exception 'fit_parts_equal: % of % requirements differ for seller % (%)', bad, cardinality(open_ids), v.id, v.kind;
    end if;
    if (select count(*) from admin.rfq_fit_set(v.id, open_ids)) <> cardinality(open_ids) then
      raise exception 'fit_parts_equal: the set function returned a different number of rows for seller %', v.id;
    end if;

    -- same_leads: everything, then the first 200 (what the app asks for). The old function is called once and timed;
    -- its order is total (score, similarity, id), so its first 200 are the first 200 of the full answer.
    truncate hx_old;
    t0 := clock_timestamp();
    insert into hx_old select * from pg_temp.match_vendor_rfqs_old(v.id, 100000) with ordinality;
    old_ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
    select count(*) into bad from (
      (select * from public.match_vendor_rfqs(v.id, 100000) with ordinality
       except select * from hx_old)
      union all
      (select * from hx_old
       except select * from public.match_vendor_rfqs(v.id, 100000) with ordinality)) d;
    if bad <> 0 then
      raise exception 'same_leads: % rows differ for seller % (%, tier %)', bad, v.id, v.kind, v.tier;
    end if;
    select count(*) into bad from (
      (select * from public.match_vendor_rfqs(v.id, 200) with ordinality
       except select * from hx_old where n <= 200)
      union all
      (select * from hx_old where n <= 200
       except select * from public.match_vendor_rfqs(v.id, 200) with ordinality)) d;
    if bad <> 0 then
      raise exception 'same_leads: % of the first 200 differ for seller % (%)', bad, v.id, v.kind;
    end if;

    -- fast_enough
    t0 := clock_timestamp();
    select count(*) into rows_new from public.match_vendor_rfqs(v.id, 200);
    new_ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
    slowest := greatest(slowest, new_ms);
    select count(*) into total from hx_old;
    raise notice 'seller % (%, tier %): % open to them; old % ms, new % ms', left(v.id::text, 8), v.kind, v.tier, total, old_ms, new_ms;
  end loop;

  if slowest > 250 then
    raise exception 'fast_enough: the slowest call took % ms over % requirements (limit 250)', slowest, cardinality(open_ids);
  end if;
  raise notice 'Task 6 lead ranking: fit_parts_equal, same_leads and fast_enough passed for 10 sellers over % requirements (slowest new call % ms)',
    cardinality(open_ids), slowest;
end
$checks$;

rollback;
