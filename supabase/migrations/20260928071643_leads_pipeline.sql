-- Admin completion, Phase 7 (Mitra, 2026-09-28): Leads, the RFQ pipeline.
--
-- Mitra chose "RFQ pipeline" for Leads: where every buyer request stands, and how fast
-- vendors answer. Read-only; nothing here changes an RFQ or a quote.
--
--   admin.lead_rows             one row per RFQ with its stage, quote count and first
--                               quote time: the one definition every RPC reads
--   admin_leads_list(...)       filtered, keyset-paged rows (newest first)
--   admin_leads_summary(days)   the open pipeline now, and response times over a window
--   admin_lead_detail(rfq)      one RFQ with its buyer, target vendor and quotes
--
-- Stages:
--   new         active, no quote yet, under 24 hours old
--   unanswered  active, no quote, 24 hours or older ("overdue" from 48 hours)
--   quoted      active, at least one quote, none accepted
--   won         a quote was accepted
--   closed      no longer active, none accepted
-- An RFQ addressed to one vendor (rfqs.vendor_id) is "direct".
--
-- Who: super_admin, vendor_ops, product_moderator, support (Cosora-Admin roles.ts "leads").
-- The buyer is named by their profile name or company; never their email or phone.

create index if not exists rfqs_created_idx on public.rfqs (created_at desc, id desc);

create or replace view admin.lead_rows as
select r.id,
       r.created_at,
       r.status::text                                                   as rfq_status,
       r.buyer_id,
       r.vendor_id                                                      as target_vendor_id,
       r.vendor_id is not null                                          as direct,
       coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.product_name), ''), 'Untitled request') as title,
       r.product_name,
       r.category_id,
       cat.name                                                         as category,
       r.quantity,
       r.budget_min,
       r.budget_max,
       coalesce(q.quotes, 0)::int                                       as quotes,
       q.first_quote_at,
       q.accepted_vendor_id,
       case when q.accepted_vendor_id is not null then 'won'
            when r.status::text <> 'active' then 'closed'
            when coalesce(q.quotes, 0) > 0 then 'quoted'
            when r.created_at > now() - interval '24 hours' then 'new'
            else 'unanswered' end                                       as stage,
       r.status::text = 'active' and coalesce(q.quotes, 0) = 0
         and r.created_at <= now() - interval '48 hours'                as overdue
  from public.rfqs r
  left join public.categories cat on cat.id = r.category_id
  left join lateral (
    select count(*)                                                      as quotes,
           min(x.created_at)                                             as first_quote_at,
           (array_agg(x.vendor_id order by x.created_at) filter (where x.status::text = 'accepted'))[1] as accepted_vendor_id
      from public.quotes x
     where x.rfq_id = r.id) q on true;

revoke all on admin.lead_rows from public, anon, authenticated;

create or replace function admin.leads_can_read()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'vendor_ops', 'product_moderator', 'support']::public.admin_role_type[]), false);
$function$;
revoke all on function admin.leads_can_read() from public, anon, authenticated;

create or replace function public.admin_leads_list(
  p_stage         text        default null,
  p_min_age_hours int         default null,
  p_category      uuid        default null,
  p_direct        boolean     default null,
  p_search        text        default null,
  p_cursor_at     timestamptz default null,
  p_cursor_id     uuid        default null,
  p_limit         int         default 50)
returns table(id uuid, created_at timestamptz, title text, category text, quantity int,
              budget_min numeric, budget_max numeric, buyer_id uuid, buyer_name text,
              direct boolean, target_vendor_id uuid, target_vendor_name text, rfq_status text,
              stage text, overdue boolean, quotes int, first_quote_at timestamptz,
              accepted_vendor_id uuid, accepted_vendor_name text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  if p_stage is not null and p_stage not in ('new', 'unanswered', 'overdue', 'quoted', 'won', 'closed') then
    raise exception 'unknown stage %', p_stage using errcode = '22023';
  end if;
  if (p_cursor_at is null) <> (p_cursor_id is null) then
    raise exception 'a cursor needs both created_at and id' using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select l.id, l.created_at, l.title, l.category, l.quantity, l.budget_min, l.budget_max,
           l.buyer_id,
           coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer'),
           l.direct, l.target_vendor_id, tv.brand_name, l.rfq_status, l.stage, l.overdue, l.quotes,
           l.first_quote_at, l.accepted_vendor_id, av.brand_name
      from admin.lead_rows l
      left join public.profiles p on p.id = l.buyer_id
      left join public.buyer_profiles bp on bp.id = l.buyer_id
      left join public.vendor_profiles tv on tv.id = l.target_vendor_id
      left join public.vendor_profiles av on av.id = l.accepted_vendor_id
     where (p_stage is null or (case when p_stage = 'overdue' then l.overdue else l.stage = p_stage end))
       and (p_min_age_hours is null or l.created_at <= now() - make_interval(hours => p_min_age_hours))
       and (p_category is null or l.category_id = p_category)
       and (p_direct is null or l.direct = p_direct)
       and (v_search is null
            or l.title ilike v_like
            or l.product_name ilike v_like
            or p.full_name ilike v_like
            or bp.company ilike v_like)
       and (p_cursor_at is null or (l.created_at, l.id) < (p_cursor_at, p_cursor_id))
     order by l.created_at desc, l.id desc
     limit v_limit;
end
$function$;

create or replace function public.admin_leads_summary(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_from   timestamptz;
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'days must be between 1 and 3650' using errcode = '22023';
  end if;
  v_from := case when p_days is null then null else now() - make_interval(days => p_days) end;

  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    -- The open pipeline as it stands, whatever an RFQ's age.
    'open', (select jsonb_build_object(
               'new',        count(*) filter (where l.stage = 'new'),
               'unanswered', count(*) filter (where l.stage = 'unanswered'),
               'overdue',    count(*) filter (where l.overdue),
               'quoted',     count(*) filter (where l.stage = 'quoted'))
               from admin.lead_rows l where l.rfq_status = 'active'),
    -- RFQs created in the window: how they ended up, and how fast vendors answered.
    'window', (select jsonb_build_object(
               'rfqs',        count(*),
               'direct',      count(*) filter (where l.direct),
               'won',         count(*) filter (where l.stage = 'won'),
               'closed',      count(*) filter (where l.stage = 'closed'),
               'answered',    count(*) filter (where l.first_quote_at is not null),
               'median_first_quote_hours',
                 round((percentile_cont(0.5) within group (
                   order by extract(epoch from (l.first_quote_at - l.created_at)) / 3600)
                   filter (where l.first_quote_at is not null))::numeric, 1),
               -- Only RFQs at least 24 hours old had a full day to be answered.
               'eligible_24h', count(*) filter (where l.created_at <= now() - interval '24 hours'),
               'answered_24h', count(*) filter (where l.created_at <= now() - interval '24 hours'
                                                  and l.first_quote_at <= l.created_at + interval '24 hours'))
               from admin.lead_rows l where v_from is null or l.created_at >= v_from)
  ) into v_result;
  return v_result;
end
$function$;

create or replace function public.admin_lead_detail(p_rfq_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not admin.leads_can_read() then
    raise exception 'not authorized: leads are for super admins, vendor ops, product moderators and support' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'id', l.id, 'created_at', l.created_at, 'title', l.title, 'product_name', l.product_name,
           'category', l.category, 'quantity', l.quantity, 'budget_min', l.budget_min, 'budget_max', l.budget_max,
           'description', r.description, 'images', to_jsonb(coalesce(r.images, array[]::text[])),
           'rfq_status', l.rfq_status, 'stage', l.stage, 'overdue', l.overdue, 'direct', l.direct,
           'buyer', jsonb_build_object('id', l.buyer_id,
                      'name', coalesce(nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''), 'Unnamed buyer')),
           'target_vendor', case when l.target_vendor_id is null then null
                                 else jsonb_build_object('id', l.target_vendor_id, 'name', tv.brand_name) end,
           'quotes', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', q.id, 'vendor_id', q.vendor_id, 'vendor_name', v.brand_name,
                         'currency', q.currency, 'price_per_unit', q.price_per_unit, 'price_inr', q.price_inr,
                         'moq', q.moq, 'lead_time', q.lead_time, 'status', q.status::text, 'created_at', q.created_at)
                         order by q.created_at)
                         from public.quotes q
                         left join public.vendor_profiles v on v.id = q.vendor_id
                        where q.rfq_id = l.id), '[]'::jsonb))
    into v_result
    from admin.lead_rows l
    join public.rfqs r on r.id = l.id
    left join public.profiles p on p.id = l.buyer_id
    left join public.buyer_profiles bp on bp.id = l.buyer_id
    left join public.vendor_profiles tv on tv.id = l.target_vendor_id
   where l.id = p_rfq_id;
  if v_result is null then
    raise exception 'no RFQ %', p_rfq_id using errcode = 'P0002';
  end if;
  return v_result;
end
$function$;

revoke all on function public.admin_leads_list(text, int, uuid, boolean, text, timestamptz, uuid, int) from public, anon, authenticated;
revoke all on function public.admin_leads_summary(int) from public, anon, authenticated;
revoke all on function public.admin_lead_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_leads_list(text, int, uuid, boolean, text, timestamptz, uuid, int) to authenticated;
grant execute on function public.admin_leads_summary(int) to authenticated;
grant execute on function public.admin_lead_detail(uuid) to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_leads_list(text, int, uuid, boolean, text, timestamptz, uuid, int)',
    'public.admin_leads_summary(int)', 'public.admin_lead_detail(uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: grants on % are wrong', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'admin.lead_rows', 'SELECT') or has_table_privilege('anon', 'admin.lead_rows', 'SELECT') then
    raise exception 'self-check: a client role can read admin.lead_rows';
  end if;
  if (select count(*) from admin.lead_rows) <> (select count(*) from public.rfqs) then
    raise exception 'self-check: admin.lead_rows is not one row per RFQ';
  end if;
end
$check$;
