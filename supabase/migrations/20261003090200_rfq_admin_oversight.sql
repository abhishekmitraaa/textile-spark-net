-- ─────────────────────────────────────────────────────────────────────────────
-- RFQ/leads R3: admin oversight, remove and flag (Mitra, 2026-10-02).
-- documentation/rfq-leads-pipeline-design-2026-10-02.md, "R3".
--
-- An RFQ still goes live the moment it's posted. Afterwards an admin (super_admin or
-- product_moderator) can:
--   * REMOVE it, with a reason the buyer reads: admin_lead_remove() sets status
--     'closed' plus removed_at / removed_by / removed_reason. Everything that shows
--     only active RFQs (rfqs_select, trg_quotes_accepting_rfq, match_vendor_rfqs, the
--     vendor pool and Direct inbox) drops it unchanged. Quotes stay as history.
--   * FLAG it: admin.admin_flags accepts 'rfq'; a flag is a note, not a takedown.
-- A removal is final for every browser client: trg_rfqs_removal_guard refuses any
-- change to a removed RFQ, and any write of the removal columns, by `authenticated`.
-- admin_lead_remove is a definer function, so its own update runs as the owner.
-- Nobody deletes an RFQ from a browser any more: rfqs_delete is dropped and DELETE is
-- revoked from anon and authenticated (a delete cascades to every quote, accepted
-- ones included, and is refused once chat references the RFQ).
-- Admin changes to rfqs now reach the Admin Log (trg_admin_audit, admins only).
-- Harness: scripts/rfq-leads/r3_oversight.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Removal columns ──────────────────────────────────────────────────────
alter table public.rfqs
  add column removed_at     timestamptz,
  add column removed_by     uuid references public.profiles(id) on delete set null,
  add column removed_reason text;
alter table public.rfqs add constraint rfqs_removal_shape check (
  (removed_at is null and removed_reason is null)
  or (removed_at is not null and status = 'closed'::public.rfq_status and length(btrim(removed_reason)) > 0)
);
comment on column public.rfqs.removed_at is
  'Set by admin_lead_remove() when Cosora takes the RFQ down. A removed RFQ is closed and can''t change again from a browser.';
comment on column public.rfqs.removed_reason is
  'Why Cosora removed it. The buyer reads it in My Quotes.';

-- ── 2. The guard ────────────────────────────────────────────────────────────
create or replace function public.rfqs_removal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Browser clients only. admin_lead_remove() is a definer function, so its update
  -- runs as the owner; service-role jobs (the embedding worker, account deletion)
  -- are not `authenticated` either.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.removed_at is not null or new.removed_by is not null or new.removed_reason is not null then
      raise exception 'Only Cosora can mark a request as removed.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.removed_at is not null then
    raise exception 'Cosora removed this request, so it can''t be changed or reopened.' using errcode = '42501';
  end if;
  if (new.removed_at, new.removed_by, new.removed_reason) is distinct from (old.removed_at, old.removed_by, old.removed_reason) then
    raise exception 'Only Cosora can mark a request as removed.' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke execute on function public.rfqs_removal_guard() from public, anon, authenticated;
create trigger trg_rfqs_removal_guard
  before insert or update on public.rfqs
  for each row execute function public.rfqs_removal_guard();

-- ── 3. Admin Log ────────────────────────────────────────────────────────────
create trigger trg_admin_audit
  after insert or update or delete on public.rfqs
  for each row execute function admin.audit_row_change('buyer_id');

-- ── 4. No browser deletes ───────────────────────────────────────────────────
drop policy rfqs_delete on public.rfqs;
revoke delete on public.rfqs from anon, authenticated;

-- ── 5. Remove ───────────────────────────────────────────────────────────────
create or replace function public.admin_lead_remove(p_rfq_id uuid, p_reason text)
returns table (id uuid, removed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_reason  text := nullif(btrim(p_reason), '');
  v_removed timestamptz;
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[]), false) then
    raise exception 'not authorized: removing a lead needs a super admin or a product moderator' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A removal needs a reason; the buyer will read it.' using errcode = '22023';
  end if;

  select r.removed_at into v_removed from public.rfqs r where r.id = p_rfq_id for update;
  if not found then
    raise exception 'no RFQ %', p_rfq_id using errcode = 'P0002';
  end if;
  if v_removed is not null then
    raise exception 'This RFQ was already removed.' using errcode = '55000';
  end if;

  perform set_config('cosora.audit_reason', v_reason, true);
  update public.rfqs r
     set status = 'closed', removed_at = now(), removed_by = auth.uid(), removed_reason = v_reason
   where r.id = p_rfq_id;
  perform set_config('cosora.audit_reason', '', true);

  return query select r.id, r.removed_at from public.rfqs r where r.id = p_rfq_id;
end
$$;
revoke execute on function public.admin_lead_remove(uuid, text) from public, anon;
grant execute on function public.admin_lead_remove(uuid, text) to authenticated;

-- ── 6. Flags accept 'rfq' (super_admin, product_moderator) ──────────────────
alter table admin.admin_flags drop constraint admin_flags_entity_type_check;
alter table admin.admin_flags add constraint admin_flags_entity_type_check
  check (entity_type = any (array['vendor', 'product', 'ad', 'conversation', 'rfq']));

create or replace function public.admin_flag_add(p_entity_type text, p_entity_id uuid, p_note text)
 returns table(id uuid, entity_type text, entity_id uuid, note text, author_id uuid, created_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_id uuid;
begin
  -- Gate = admin_flags_insert: WITH CHECK (is_admin() AND author_id = auth.uid())
  if not coalesce(public.is_admin(), false) then
    raise exception 'Adding to the flagged-items log requires an admin account'
      using errcode = '42501';
  end if;
  -- A lead is flagged by the roles that may remove one (RFQ/leads R3).
  if p_entity_type = 'rfq'
     and not coalesce(public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[]), false) then
    raise exception 'Flagging a lead needs a super admin or a product moderator'
      using errcode = '42501';
  end if;

  -- The table's CHECK constraints (entity_type, non-blank note) still apply and
  -- raise 23514 exactly as they do for a direct insert.
  insert into admin.admin_flags as f (entity_type, entity_id, note, author_id)
  values (p_entity_type, p_entity_id, p_note, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.entity_type, f.entity_id, f.note, f.author_id, f.created_at
      from admin.admin_flags f
     where f.id = v_id;
end
$function$;

-- ── 7. The Leads page sees removals ─────────────────────────────────────────
create or replace view admin.lead_rows as
 select r.id,
    r.created_at,
    r.status::text as rfq_status,
    r.buyer_id,
    r.vendor_id as target_vendor_id,
    r.vendor_id is not null as direct,
    coalesce(nullif(btrim(r.title), ''::text), nullif(btrim(r.product_name), ''::text), 'Untitled request'::text) as title,
    r.product_name,
    r.category_id,
    cat.name as category,
    r.quantity,
    r.budget_min,
    r.budget_max,
    coalesce(q.quotes, 0::bigint)::integer as quotes,
    q.first_quote_at,
    q.accepted_vendor_id,
        case
            when r.removed_at is not null then 'removed'::text
            when q.accepted_vendor_id is not null then 'won'::text
            when r.status::text <> 'active'::text then 'closed'::text
            when coalesce(q.quotes, 0::bigint) > 0 then 'quoted'::text
            when r.created_at > (now() - '24:00:00'::interval) then 'new'::text
            else 'unanswered'::text
        end as stage,
    r.status::text = 'active'::text and coalesce(q.quotes, 0::bigint) = 0 and r.created_at <= (now() - '48:00:00'::interval) as overdue,
    r.removed_at,
    r.removed_by,
    r.removed_reason
   from public.rfqs r
     left join public.categories cat on cat.id = r.category_id
     left join lateral ( select count(*) as quotes,
            min(x.created_at) as first_quote_at,
            (array_agg(x.vendor_id order by x.created_at) filter (where x.status::text = 'accepted'::text))[1] as accepted_vendor_id
           from public.quotes x
          where x.rfq_id = r.id) q on true;

create or replace function public.admin_leads_list(p_stage text default null::text, p_min_age_hours integer default null::integer, p_category uuid default null::uuid, p_direct boolean default null::boolean, p_search text default null::text, p_cursor_at timestamp with time zone default null::timestamp with time zone, p_cursor_id uuid default null::uuid, p_limit integer default 50)
 returns table(id uuid, created_at timestamp with time zone, title text, category text, quantity integer, budget_min numeric, budget_max numeric, buyer_id uuid, buyer_name text, direct boolean, target_vendor_id uuid, target_vendor_name text, rfq_status text, stage text, overdue boolean, quotes integer, first_quote_at timestamp with time zone, accepted_vendor_id uuid, accepted_vendor_name text)
 language plpgsql
 stable security definer
 set search_path to ''
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
  if p_stage is not null and p_stage not in ('new', 'unanswered', 'overdue', 'quoted', 'won', 'closed', 'removed') then
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

create or replace function public.admin_leads_summary(p_days integer default 30)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
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
    -- A removed RFQ counts as removed, never as closed (RFQ/leads R3).
    'window', (select jsonb_build_object(
               'rfqs',        count(*),
               'direct',      count(*) filter (where l.direct),
               'won',         count(*) filter (where l.stage = 'won'),
               'closed',      count(*) filter (where l.stage = 'closed'),
               'removed',     count(*) filter (where l.stage = 'removed'),
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
 stable security definer
 set search_path to ''
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
           'removal', case when l.removed_at is null then null
                           else jsonb_build_object('at', l.removed_at, 'reason', l.removed_reason,
                                  'by', case when l.removed_by is null then null else admin.audit_actor_name(l.removed_by) end) end,
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

-- ── Self-check ──────────────────────────────────────────────────────────────
do $check$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rfqs' and cmd in ('DELETE', 'ALL')) then
    raise exception 'R3 self-check: a DELETE policy remains on rfqs';
  end if;
  if has_table_privilege('authenticated', 'public.rfqs', 'DELETE') or has_table_privilege('anon', 'public.rfqs', 'DELETE') then
    raise exception 'R3 self-check: a browser role can still DELETE rfqs';
  end if;
  if has_function_privilege('anon', 'public.admin_lead_remove(uuid, text)', 'EXECUTE') then
    raise exception 'R3 self-check: anon can call admin_lead_remove';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.rfqs'::regclass and tgname = 'trg_rfqs_removal_guard')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.rfqs'::regclass and tgname = 'trg_admin_audit') then
    raise exception 'R3 self-check: a trigger is missing on rfqs';
  end if;
end
$check$;
