-- Subscriptions P8: the CRM (plan "build every vendor subscription feature", 2026-10-09).
-- Silver and above keep a pipeline of the leads they are working on; Gold and VIP also get
-- its analytics and WhatsApp follow-up reminders. (VIP's monthly success review with an
-- account manager comes with P9, where account managers exist.)
--
-- LEVELS (subscription_plans.limits.crm_level): Free and Basic none, Silver 'pipeline',
-- Gold 'analytics', VIP 'success'. In force only where the `crm` switch lists the vendor.
--
-- DATA. One row per lead a vendor tracks (public.vendor_lead_pipeline): from a requirement
-- (tracked from Leads, or when they quote, or when a buyer sends one to them) or added by
-- hand. Each has a stage (new, contacted, quoted, negotiating, won, lost), a value, tags,
-- notes (public.vendor_lead_notes, append-only, stage moves recorded there too) and
-- follow-ups (public.vendor_lead_followups).
--
-- WHO WRITES. A vendor reads their own rows. Every write is a function below that checks the
-- caller's level, the requirement (the overseas rule included), the limits, and keeps the
-- stage history; there are no write policies. The database also moves stages itself:
--   quote sent -> quoted, quote shortlisted -> negotiating, accepted -> won, declined -> lost,
--   a chat with the buyer opened -> contacted, a requirement sent to the vendor -> a new lead,
--   a requirement Cosora removed -> its title is replaced and an open lead is lost.
-- Those triggers never fail the quote, chat or post that fires them, and only ever move a
-- lead forward.
--
-- REMINDERS. public.crm_followup_run(), every 15 minutes once its job is approved
-- (20261009120100), rings the bell for each follow-up that is due, and on Gold and VIP also
-- queues a WhatsApp reminder (the vendor's own name and a count: nothing a buyer wrote).
--
-- Harness: scripts/subscriptions/p8_crm.sql.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure))
     <> '16f8cc7dda414e7fb9e22e6182eed213' then
    raise exception 'vendor_entitlements changed since it was read; re-read it before patching';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_quotes_crm', 'trg_conversations_crm', 'trg_rfqs_crm')) then
    raise exception 'a CRM trigger already exists';
  end if;
end
$guard$;

-- ── 1. The switch and each plan's level ────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('crm',
        'The CRM (subscriptions P8): the pipeline, follow-ups and (Gold and VIP) analytics and WhatsApp reminders, for vendors whose plan includes it and this switch lists. Off: the pages are hidden and nothing is tracked.',
        false)
on conflict (key) do nothing;

update public.subscription_plans set limits = limits || '{"crm_level": "none"}'::jsonb where id not in ('silver', 'gold', 'vip');
update public.subscription_plans set limits = limits || '{"crm_level": "pipeline"}'::jsonb where id = 'silver';
update public.subscription_plans set limits = limits || '{"crm_level": "analytics"}'::jsonb where id = 'gold';
update public.subscription_plans set limits = limits || '{"crm_level": "success"}'::jsonb where id = 'vip';

-- 'none', 'pipeline', 'analytics' or 'success': the plan in force (the grace days count),
-- where the switch lists the vendor.
create or replace function admin.vendor_crm_level(p_vendor uuid)
returns text
language sql stable security definer set search_path = '' as $function$
  select case when p_vendor is null or not admin.feature_on_for('crm', p_vendor) then 'none'
              else coalesce((
                select case p.limits ->> 'crm_level' when 'pipeline' then 'pipeline' when 'analytics' then 'analytics'
                                                     when 'success' then 'success' else 'none' end
                  from admin.vendor_effective_plan(p_vendor, now()) e
                  join public.subscription_plans p on p.id = e.plan_id
                 where e.status in ('active', 'grace') and p.id <> 'free'), 'none') end
$function$;

-- How far a stage is along: new 0, contacted 1, quoted 2, negotiating 3, won 4; lost -1.
create or replace function public.crm_stage_rank(p_stage text)
returns integer
language sql immutable set search_path = '' as $function$
  select case p_stage when 'new' then 0 when 'contacted' then 1 when 'quoted' then 2
                      when 'negotiating' then 3 when 'won' then 4 when 'lost' then -1 end
$function$;

create or replace function public.crm_tags_ok(p text[])
returns boolean
language sql immutable set search_path = '' as $function$
  select cardinality(p) <= 10 and coalesce((select bool_and(char_length(btrim(t)) between 1 and 24) from unnest(p) t), true)
$function$;

-- ── 2. Tables ──────────────────────────────────────────────────────────────────────
create table public.vendor_lead_pipeline (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references public.vendor_profiles (id) on delete cascade,
  rfq_id            uuid references public.rfqs (id) on delete set null,
  buyer_id          uuid references public.profiles (id) on delete set null,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  buyer_name        text check (buyer_name is null or char_length(buyer_name) <= 120),
  stage             text not null default 'new' check (stage in ('new', 'contacted', 'quoted', 'negotiating', 'won', 'lost')),
  value_inr         numeric(14, 2) check (value_inr is null or (value_inr >= 0 and value_inr <= 1e11)),
  tags              text[] not null default '{}' check (public.crm_tags_ok(tags)),
  source            text not null default 'manual' check (source in ('lead', 'quote', 'direct', 'manual')),
  lost_reason       text check (lost_reason is null or char_length(lost_reason) <= 200),
  next_follow_up_at timestamptz,
  stage_changed_at  timestamptz not null default now(),
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (vendor_id, rfq_id)
);
create index vendor_lead_pipeline_vendor_idx on public.vendor_lead_pipeline (vendor_id, stage, updated_at desc);
create index vendor_lead_pipeline_buyer_idx on public.vendor_lead_pipeline (buyer_id) where buyer_id is not null;
create index vendor_lead_pipeline_rfq_idx on public.vendor_lead_pipeline (rfq_id) where rfq_id is not null;
comment on table public.vendor_lead_pipeline is
  'A vendor''s CRM (subscriptions P8): one row per lead they are working on. The vendor reads their own; every write goes through the crm_* functions, which check the plan, the requirement and the limits. title is the vendor''s copy, taken from the requirement when tracked.';

create table public.vendor_lead_notes (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.vendor_lead_pipeline (id) on delete cascade,
  vendor_id   uuid not null references public.vendor_profiles (id) on delete cascade,
  kind        text not null check (kind in ('note', 'stage', 'follow_up')),
  body        text not null check (char_length(body) between 1 and 2000),
  meta        jsonb not null default '{}'::jsonb,
  created_by  uuid,
  -- clock_timestamp: a lead's history keeps its order even when several entries are written
  -- in one transaction (a lead created and moved by one quote).
  created_at  timestamptz not null default clock_timestamp()
);
create index vendor_lead_notes_pipeline_idx on public.vendor_lead_notes (pipeline_id, created_at desc);
comment on table public.vendor_lead_notes is
  'A CRM lead''s history (subscriptions P8), append-only: the vendor''s notes, every stage move (meta: from, to, by, reason) and follow-ups done.';

create table public.vendor_lead_followups (
  id          uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.vendor_lead_pipeline (id) on delete cascade,
  vendor_id   uuid not null references public.vendor_profiles (id) on delete cascade,
  due_at      timestamptz not null,
  note        text check (note is null or char_length(note) <= 280),
  done_at     timestamptz,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index vendor_lead_followups_vendor_idx on public.vendor_lead_followups (vendor_id, due_at) where done_at is null;
create index vendor_lead_followups_due_idx on public.vendor_lead_followups (due_at) where done_at is null and notified_at is null;
create index vendor_lead_followups_pipeline_idx on public.vendor_lead_followups (pipeline_id);
comment on table public.vendor_lead_followups is
  'When a vendor means to get back to a lead (subscriptions P8). crm_followup_run() rings the bell when one is due (notified_at), and on Gold and VIP queues a WhatsApp reminder.';

alter table public.vendor_lead_pipeline enable row level security;
alter table public.vendor_lead_notes enable row level security;
alter table public.vendor_lead_followups enable row level security;
create policy vendor_lead_pipeline_select on public.vendor_lead_pipeline for select using (vendor_id = (select auth.uid()));
create policy vendor_lead_notes_select on public.vendor_lead_notes for select using (vendor_id = (select auth.uid()));
create policy vendor_lead_followups_select on public.vendor_lead_followups for select using (vendor_id = (select auth.uid()));
revoke all on public.vendor_lead_pipeline, public.vendor_lead_notes, public.vendor_lead_followups from anon, authenticated;
grant select on public.vendor_lead_pipeline, public.vendor_lead_notes, public.vendor_lead_followups to authenticated;

-- Limits, so one account can't grow these without bound.
create table admin.crm_config (
  id                  boolean primary key default true check (id),
  max_leads           integer not null default 5000 check (max_leads > 0),
  max_notes_per_lead  integer not null default 500 check (max_notes_per_lead > 0),
  max_open_follow_ups integer not null default 1000 check (max_open_follow_ups > 0)
);
insert into admin.crm_config default values;
revoke all on admin.crm_config from public, anon, authenticated;

-- ── 3. Helpers ─────────────────────────────────────────────────────────────────────
-- One vendor's CRM writes at a time, so the limits are counted under a lock (claude.md: a
-- limit that counts rows needs a lock keyed on the writer). Bounded wait.
create or replace function admin.crm_lock(p_vendor uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_wait text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(hashtextextended('cosora.crm:' || p_vendor::text, 0));
  perform set_config('lock_timeout', v_wait, true);
end
$function$;

-- The requirement as this vendor may track it: one sent to them, one they quoted on, or an
-- open one they can see (the overseas rule, P7). Nothing for the buyer's own, or a removed one.
create or replace function admin.crm_rfq_for(p_vendor uuid, p_rfq uuid)
returns table (title text, buyer_id uuid, quantity integer, direct boolean)
language sql stable security definer set search_path = '' as $function$
  select r.title, r.buyer_id, r.quantity, r.vendor_id is not null
    from public.rfqs r
   where r.id = p_rfq
     and r.buyer_id <> p_vendor
     and r.removed_at is null
     and (r.vendor_id = p_vendor
          or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor)
          or (r.status::text = 'active' and r.vendor_id is null
              and public.overseas_rfq_visible(r.overseas, r.overseas_vip_until, admin.vendor_overseas_tier(p_vendor))))
$function$;

-- Moves a lead to a stage, keeps closed_at and the reason, and records the move.
create or replace function admin.crm_move(p_id uuid, p_stage text, p_by uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = '' as $function$
declare
  v_old text;
  v_vendor uuid;
begin
  select l.stage, l.vendor_id into v_old, v_vendor from public.vendor_lead_pipeline l where l.id = p_id for update;
  if not found or v_old = p_stage then
    return false;
  end if;
  update public.vendor_lead_pipeline
     set stage = p_stage,
         stage_changed_at = now(),
         closed_at = case when p_stage in ('won', 'lost') then now() end,
         lost_reason = case when p_stage = 'lost' then left(nullif(btrim(coalesce(p_reason, '')), ''), 200) end,
         updated_at = now()
   where id = p_id;
  insert into public.vendor_lead_notes (pipeline_id, vendor_id, kind, body, meta, created_by)
  values (p_id, v_vendor, 'stage', p_stage,
          jsonb_build_object('from', v_old, 'to', p_stage, 'by', case when p_by is null then 'system' else 'vendor' end)
            || case when nullif(btrim(coalesce(p_reason, '')), '') is null then '{}'::jsonb
                    else jsonb_build_object('reason', left(btrim(p_reason), 200)) end,
          p_by);
  return true;
end
$function$;

-- The earliest open follow-up, kept on the lead for sorting.
create or replace function admin.crm_refresh_next(p_id uuid)
returns void
language sql security definer set search_path = '' as $function$
  update public.vendor_lead_pipeline l
     set next_follow_up_at = (select min(f.due_at) from public.vendor_lead_followups f where f.pipeline_id = l.id and f.done_at is null)
   where l.id = p_id;
$function$;

-- Adds a lead for a vendor, within the limit; p_by is the vendor when they added it, null when
-- the database did. Null when there is no room; the existing id when it is already tracked.
create or replace function admin.crm_insert_lead(p_vendor uuid, p_rfq uuid, p_buyer uuid, p_title text, p_buyer_name text,
                                                 p_stage text, p_value numeric, p_source text, p_tags text[], p_by uuid)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_id uuid;
  v_max integer;
begin
  perform admin.crm_lock(p_vendor);
  if p_rfq is not null then
    select l.id into v_id from public.vendor_lead_pipeline l where l.vendor_id = p_vendor and l.rfq_id = p_rfq;
    if found then
      return v_id;
    end if;
  end if;
  select c.max_leads into v_max from admin.crm_config c;
  if (select count(*) from public.vendor_lead_pipeline l where l.vendor_id = p_vendor) >= coalesce(v_max, 5000) then
    return null;
  end if;
  insert into public.vendor_lead_pipeline (vendor_id, rfq_id, buyer_id, title, buyer_name, stage, value_inr, source, tags,
                                           closed_at)
  values (p_vendor, p_rfq, p_buyer, left(btrim(p_title), 200), nullif(btrim(coalesce(p_buyer_name, '')), ''), p_stage,
          p_value, p_source, coalesce(p_tags, '{}'), case when p_stage in ('won', 'lost') then now() end)
  returning id into v_id;
  insert into public.vendor_lead_notes (pipeline_id, vendor_id, kind, body, meta, created_by)
  values (v_id, p_vendor, 'stage', p_stage,
          jsonb_build_object('from', null, 'to', p_stage, 'by', case when p_by is null then 'system' else 'vendor' end, 'source', p_source),
          p_by);
  return v_id;
end
$function$;

-- The caller, when their plan includes the CRM at `p_min` or above.
create or replace function admin.crm_caller(p_min text default 'pipeline')
returns uuid
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := auth.uid();
  v_level text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_level := admin.vendor_crm_level(v_me);
  if v_level = 'none' then
    raise exception 'The CRM comes with the Silver, Gold and VIP plans.' using errcode = '42501';
  end if;
  if p_min = 'analytics' and v_level not in ('analytics', 'success') then
    raise exception 'CRM analytics come with the Gold and VIP plans.' using errcode = '42501';
  end if;
  return v_me;
end
$function$;

-- ── 4. What a vendor can do ────────────────────────────────────────────────────────
-- Track a requirement (from Leads). Returns the lead's id.
create or replace function public.crm_track(p_rfq uuid)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  r record;
  v_id uuid;
begin
  select * into r from admin.crm_rfq_for(v_me, p_rfq);
  if not found then
    raise exception 'That requirement isn''t one you can track.' using errcode = 'P0002';
  end if;
  v_id := admin.crm_insert_lead(v_me, p_rfq, r.buyer_id, r.title, null, 'new', null,
                                case when r.direct then 'direct' else 'lead' end, '{}', v_me);
  if v_id is null then
    raise exception 'Your CRM is full. Remove leads you no longer need.' using errcode = 'P0001';
  end if;
  return v_id;
end
$function$;

-- Add a lead by hand.
create or replace function public.crm_add_lead(p_title text, p_buyer_name text default null, p_value numeric default null,
                                               p_tags text[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  v_id uuid;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'Give the lead a name.' using errcode = '22023';
  end if;
  if p_value is not null and (p_value < 0 or p_value > 1e11) then
    raise exception 'The value doesn''t look right.' using errcode = '22023';
  end if;
  if not public.crm_tags_ok(coalesce(p_tags, '{}')) then
    raise exception 'Up to 10 tags, each up to 24 characters.' using errcode = '22023';
  end if;
  v_id := admin.crm_insert_lead(v_me, null, null, p_title, left(p_buyer_name, 120), 'new', round(p_value, 2), 'manual', p_tags, v_me);
  if v_id is null then
    raise exception 'Your CRM is full. Remove leads you no longer need.' using errcode = 'P0001';
  end if;
  return v_id;
end
$function$;

-- Change a lead. p_patch's keys say what changes: title, buyer_name, value_inr, tags, stage,
-- lost_reason (with stage 'lost'). A key with null clears it where that is allowed.
create or replace function public.crm_update_lead(p_id uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  l public.vendor_lead_pipeline%rowtype;
  v_tags text[];
  v_value numeric;
begin
  select * into l from public.vendor_lead_pipeline x where x.id = p_id and x.vendor_id = v_me for update;
  if not found then
    raise exception 'That lead wasn''t found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_patch) k
                 where k not in ('title', 'buyer_name', 'value_inr', 'tags', 'stage', 'lost_reason')) then
    raise exception 'Only title, buyer_name, value_inr, tags, stage and lost_reason can change.' using errcode = '22023';
  end if;
  if p_patch ? 'title' then
    if nullif(btrim(coalesce(p_patch ->> 'title', '')), '') is null then
      raise exception 'Give the lead a name.' using errcode = '22023';
    end if;
    l.title := left(btrim(p_patch ->> 'title'), 200);
  end if;
  if p_patch ? 'buyer_name' then
    l.buyer_name := left(nullif(btrim(coalesce(p_patch ->> 'buyer_name', '')), ''), 120);
  end if;
  if p_patch ? 'value_inr' then
    begin
      v_value := (p_patch ->> 'value_inr')::numeric;
    exception when others then
      raise exception 'The value doesn''t look right.' using errcode = '22023';
    end;
    if v_value is not null and (v_value < 0 or v_value > 1e11) then
      raise exception 'The value doesn''t look right.' using errcode = '22023';
    end if;
    l.value_inr := round(v_value, 2);
  end if;
  if p_patch ? 'tags' then
    if jsonb_typeof(p_patch -> 'tags') <> 'array' then
      raise exception 'Tags are a list.' using errcode = '22023';
    end if;
    v_tags := array(select distinct btrim(t) from jsonb_array_elements_text(p_patch -> 'tags') t where btrim(t) <> '');
    if not public.crm_tags_ok(v_tags) then
      raise exception 'Up to 10 tags, each up to 24 characters.' using errcode = '22023';
    end if;
    l.tags := v_tags;
  end if;
  update public.vendor_lead_pipeline
     set title = l.title, buyer_name = l.buyer_name, value_inr = l.value_inr, tags = l.tags, updated_at = now()
   where id = p_id;
  if p_patch ? 'stage' then
    if public.crm_stage_rank(p_patch ->> 'stage') is null then
      raise exception 'Unknown stage.' using errcode = '22023';
    end if;
    perform admin.crm_move(p_id, p_patch ->> 'stage', v_me, p_patch ->> 'lost_reason');
  end if;
end
$function$;

create or replace function public.crm_delete_lead(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
begin
  delete from public.vendor_lead_pipeline where id = p_id and vendor_id = v_me;
  if not found then
    raise exception 'That lead wasn''t found.' using errcode = 'P0002';
  end if;
end
$function$;

create or replace function public.crm_add_note(p_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  v_id uuid;
  v_max integer;
begin
  if nullif(btrim(coalesce(p_body, '')), '') is null or char_length(p_body) > 2000 then
    raise exception 'A note is 1 to 2,000 characters.' using errcode = '22023';
  end if;
  perform admin.crm_lock(v_me);
  if not exists (select 1 from public.vendor_lead_pipeline l where l.id = p_id and l.vendor_id = v_me) then
    raise exception 'That lead wasn''t found.' using errcode = 'P0002';
  end if;
  select c.max_notes_per_lead into v_max from admin.crm_config c;
  if (select count(*) from public.vendor_lead_notes n where n.pipeline_id = p_id) >= coalesce(v_max, 500) then
    raise exception 'This lead has as many notes as it can hold.' using errcode = 'P0001';
  end if;
  insert into public.vendor_lead_notes (pipeline_id, vendor_id, kind, body, created_by)
  values (p_id, v_me, 'note', btrim(p_body), v_me)
  returning id into v_id;
  update public.vendor_lead_pipeline set updated_at = now() where id = p_id;
  return v_id;
end
$function$;

create or replace function public.crm_add_follow_up(p_id uuid, p_due timestamptz, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  v_id uuid;
  v_max integer;
begin
  if p_due is null or p_due < now() - interval '1 day' or p_due > now() + interval '1 year' then
    raise exception 'Choose a time within the next year.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'A follow-up note is up to 280 characters.' using errcode = '22023';
  end if;
  perform admin.crm_lock(v_me);
  if not exists (select 1 from public.vendor_lead_pipeline l where l.id = p_id and l.vendor_id = v_me) then
    raise exception 'That lead wasn''t found.' using errcode = 'P0002';
  end if;
  select c.max_open_follow_ups into v_max from admin.crm_config c;
  if (select count(*) from public.vendor_lead_followups f where f.vendor_id = v_me and f.done_at is null) >= coalesce(v_max, 1000) then
    raise exception 'You have as many open follow-ups as the CRM holds. Mark some done first.' using errcode = 'P0001';
  end if;
  insert into public.vendor_lead_followups (pipeline_id, vendor_id, due_at, note)
  values (p_id, v_me, p_due, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  perform admin.crm_refresh_next(p_id);
  update public.vendor_lead_pipeline set updated_at = now() where id = p_id;
  return v_id;
end
$function$;

-- Mark a follow-up done (or not), or move it. A moved one is reminded again.
create or replace function public.crm_update_follow_up(p_follow_up uuid, p_done boolean default null,
                                                       p_due timestamptz default null)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  f public.vendor_lead_followups%rowtype;
begin
  select * into f from public.vendor_lead_followups x where x.id = p_follow_up and x.vendor_id = v_me for update;
  if not found then
    raise exception 'That follow-up wasn''t found.' using errcode = 'P0002';
  end if;
  if p_due is not null then
    if p_due < now() - interval '1 day' or p_due > now() + interval '1 year' then
      raise exception 'Choose a time within the next year.' using errcode = '22023';
    end if;
    update public.vendor_lead_followups set due_at = p_due, notified_at = null where id = p_follow_up;
  end if;
  if p_done is true and f.done_at is null then
    update public.vendor_lead_followups set done_at = now() where id = p_follow_up;
    insert into public.vendor_lead_notes (pipeline_id, vendor_id, kind, body, meta, created_by)
    values (f.pipeline_id, v_me, 'follow_up', coalesce(f.note, 'Followed up'),
            jsonb_build_object('due_at', f.due_at, 'on_time', now() <= f.due_at + interval '1 day'), v_me);
  elsif p_done is false and f.done_at is not null then
    update public.vendor_lead_followups set done_at = null where id = p_follow_up;
  end if;
  perform admin.crm_refresh_next(f.pipeline_id);
  update public.vendor_lead_pipeline set updated_at = now() where id = f.pipeline_id;
end
$function$;

create or replace function public.crm_delete_follow_up(p_follow_up uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.crm_caller();
  v_lead uuid;
begin
  delete from public.vendor_lead_followups where id = p_follow_up and vendor_id = v_me returning pipeline_id into v_lead;
  if v_lead is null then
    raise exception 'That follow-up wasn''t found.' using errcode = 'P0002';
  end if;
  perform admin.crm_refresh_next(v_lead);
end
$function$;

-- ── 5. Analytics (Gold and VIP) ────────────────────────────────────────────────────
create or replace function public.crm_analytics(p_days integer default 90)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me    uuid := admin.crm_caller('analytics');
  v_days  integer := least(greatest(coalesce(p_days, 90), 7), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_out   jsonb;
begin
  with mine as (
    select * from public.vendor_lead_pipeline l where l.vendor_id = v_me
  ), reached as (
    -- How far each lead created in the window got: its stage now, and every stage it passed.
    select m.id,
           greatest(public.crm_stage_rank(m.stage),
                    coalesce((select max(greatest(coalesce(public.crm_stage_rank(n.meta ->> 'from'), -1),
                                                  coalesce(public.crm_stage_rank(n.meta ->> 'to'), -1)))
                                from public.vendor_lead_notes n where n.pipeline_id = m.id and n.kind = 'stage'), -1)) as r
      from mine m where m.created_at >= v_since
  ), closed as (
    select * from mine m where m.closed_at >= v_since and m.stage in ('won', 'lost')
  ), due as (
    select f.* from public.vendor_lead_followups f
     where f.vendor_id = v_me and f.due_at >= v_since and f.due_at <= now()
  )
  select jsonb_build_object(
    'days', v_days,
    'open', (select coalesce(jsonb_object_agg(s.stage, jsonb_build_object('count', s.n, 'value', s.v)), '{}'::jsonb)
               from (select m.stage, count(*) as n, coalesce(sum(m.value_inr), 0) as v from mine m
                      where m.stage not in ('won', 'lost') group by m.stage) s),
    'open_value', (select coalesce(sum(m.value_inr), 0) from mine m where m.stage not in ('won', 'lost')),
    'created', (select count(*) from reached),
    'funnel', jsonb_build_object(
       'new',         (select count(*) from reached),
       'contacted',   (select count(*) from reached where r >= 1),
       'quoted',      (select count(*) from reached where r >= 2),
       'negotiating', (select count(*) from reached where r >= 3),
       'won',         (select count(*) from reached where r >= 4)),
    'won', (select count(*) from closed where stage = 'won'),
    'won_value', (select coalesce(sum(value_inr), 0) from closed where stage = 'won'),
    'lost', (select count(*) from closed where stage = 'lost'),
    'win_rate', (select case when count(*) = 0 then null
                             else round(count(*) filter (where stage = 'won')::numeric / count(*), 3) end from closed),
    'avg_days_to_win', (select round((avg(extract(epoch from (closed_at - created_at))) / 86400)::numeric, 1)
                          from closed where stage = 'won'),
    'lost_reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', x.reason, 'count', x.n) order by x.n desc, x.reason), '[]'::jsonb)
                       from (select coalesce(lost_reason, 'No reason given') as reason, count(*) as n
                               from closed where stage = 'lost' group by 1 order by 2 desc, 1 limit 5) x),
    'by_source', (select coalesce(jsonb_object_agg(s.source, s.n), '{}'::jsonb)
                    from (select m.source, count(*) as n from mine m where m.created_at >= v_since group by m.source) s),
    'follow_ups', jsonb_build_object(
       'due', (select count(*) from due),
       'done', (select count(*) from due where done_at is not null),
       'on_time', (select count(*) from due where done_at is not null and done_at <= due_at + interval '1 day'),
       'overdue_open', (select count(*) from public.vendor_lead_followups f
                         where f.vendor_id = v_me and f.done_at is null and f.due_at < now()))
  ) into v_out;
  return v_out;
end
$function$;

-- ── 6. The database moves stages itself ────────────────────────────────────────────
-- None of these may fail the write that fires them: each catches everything and warns.

-- Quotes: sent -> quoted (and tracked, with a value), shortlisted -> negotiating,
-- accepted -> won, declined -> lost. Only ever forward; a won lead stays won.
create or replace function admin.crm_on_quote()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_id uuid;
  v_stage text;
  v_to text;
  r record;
begin
  begin
    if admin.vendor_crm_level(new.vendor_id) = 'none' then
      return null;
    end if;
    if tg_op = 'INSERT' then
      select l.id, l.stage into v_id, v_stage from public.vendor_lead_pipeline l
       where l.vendor_id = new.vendor_id and l.rfq_id = new.rfq_id;
      select q.title, q.buyer_id, q.quantity into r from public.rfqs q where q.id = new.rfq_id;
      if v_id is null then
        perform admin.crm_insert_lead(new.vendor_id, new.rfq_id, r.buyer_id, coalesce(r.title, 'Requirement'), null, 'quoted',
                  round(coalesce(new.price_inr, new.price_per_unit) * r.quantity, 2), 'quote', '{}', null);
      else
        if public.crm_stage_rank(v_stage) between 0 and 1 then
          perform admin.crm_move(v_id, 'quoted', null, 'Quote sent');
        end if;
        update public.vendor_lead_pipeline
           set value_inr = coalesce(value_inr, round(coalesce(new.price_inr, new.price_per_unit) * r.quantity, 2))
         where id = v_id;
      end if;
    elsif new.status is distinct from old.status then
      v_to := case new.status::text when 'shortlisted' then 'negotiating' when 'accepted' then 'won'
                                    when 'rejected' then 'lost' end;
      if v_to is null then
        return null;
      end if;
      select l.id, l.stage into v_id, v_stage from public.vendor_lead_pipeline l
       where l.vendor_id = new.vendor_id and l.rfq_id = new.rfq_id;
      if v_id is not null and v_stage <> 'won'
         and (v_to = 'won' or (v_stage <> 'lost' and public.crm_stage_rank(v_to) > public.crm_stage_rank(v_stage))
              or (v_to = 'lost' and v_stage <> 'lost')) then
        perform admin.crm_move(v_id, v_to, null,
          case v_to when 'won' then 'The buyer accepted your quote' when 'lost' then 'The buyer declined your quote'
                    else 'The buyer shortlisted your quote' end);
      end if;
    end if;
  exception when others then
    raise warning 'crm_on_quote: % %', sqlstate, sqlerrm;
  end;
  return null;
end
$function$;
create trigger trg_quotes_crm after insert or update of status on public.quotes
  for each row execute function admin.crm_on_quote();

-- A chat opened between a vendor and a buyer: their new leads with that buyer are contacted.
create or replace function admin.crm_on_conversation()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  l record;
begin
  begin
    for l in
      select p.id from public.vendor_lead_pipeline p
       where p.stage = 'new'
         and ((p.vendor_id = new.user_a and p.buyer_id = new.user_b) or (p.vendor_id = new.user_b and p.buyer_id = new.user_a))
         and admin.vendor_crm_level(p.vendor_id) <> 'none'
    loop
      perform admin.crm_move(l.id, 'contacted', null, 'A chat with the buyer was opened');
    end loop;
  exception when others then
    raise warning 'crm_on_conversation: % %', sqlstate, sqlerrm;
  end;
  return null;
end
$function$;
create trigger trg_conversations_crm after insert on public.conversations
  for each row execute function admin.crm_on_conversation();

-- A requirement sent to one vendor becomes a new lead for them. One Cosora removes loses its
-- words from every CRM, and an open lead on it is lost.
create or replace function admin.crm_on_rfq()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  l record;
begin
  begin
    if tg_op = 'INSERT' then
      if new.vendor_id is not null and admin.vendor_crm_level(new.vendor_id) <> 'none' then
        perform admin.crm_insert_lead(new.vendor_id, new.id, new.buyer_id, coalesce(new.title, 'Requirement'), null, 'new',
                                      null, 'direct', '{}', null);
      end if;
    elsif new.removed_at is not null and old.removed_at is null then
      for l in select p.id, p.stage from public.vendor_lead_pipeline p where p.rfq_id = new.id loop
        update public.vendor_lead_pipeline set title = 'Requirement removed by Cosora', updated_at = now() where id = l.id;
        if l.stage not in ('won', 'lost') then
          perform admin.crm_move(l.id, 'lost', null, 'Removed by Cosora');
        end if;
      end loop;
    end if;
  exception when others then
    raise warning 'crm_on_rfq: % %', sqlstate, sqlerrm;
  end;
  return null;
end
$function$;
create trigger trg_rfqs_crm after insert or update of removed_at on public.rfqs
  for each row execute function admin.crm_on_rfq();

-- ── 7. Follow-up reminders ─────────────────────────────────────────────────────────
insert into admin.notification_templates (key, channel, locale, version, subject, body, wa_template, wa_language, wa_params,
                                          transactional, active)
values ('crm_followup', 'whatsapp', 'en', 1, null,
        'Hello {{name}}, you have {{count}} follow-up(s) with buyers due now. Open your CRM on Cosora to see them.',
        'crm_followup_reminder', 'en', array['name', 'count'], true, false)
on conflict do nothing;

-- Rings the bell for each vendor with follow-ups due, and on Gold and VIP queues a WhatsApp
-- reminder (sent once its Meta template is approved and the vendor has said yes to WhatsApp,
-- P2). The job's and the service role's to call.
create or replace function public.crm_followup_run()
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v record;
  v_vendors integer := 0;
  v_due integer := 0;
begin
  if not admin.trusted_caller() then
    raise exception 'The follow-up run is Cosora''s to start.' using errcode = '42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('cosora.crm_followup_run', 0)) then
    return jsonb_build_object('skipped', 'running');
  end if;

  for v in
    with due as (
      select f.id, f.vendor_id, f.pipeline_id, f.due_at
        from public.vendor_lead_followups f
       where f.done_at is null and f.notified_at is null
         and f.due_at <= now() and f.due_at > now() - interval '7 days'
       order by f.due_at
       limit 5000
    )
    select d.vendor_id, array_agg(d.id) as ids, count(*) as n,
           (array_agg(l.title order by d.due_at))[1] as first_title,
           admin.vendor_crm_level(d.vendor_id) as level
      from due d join public.vendor_lead_pipeline l on l.id = d.pipeline_id
     group by d.vendor_id
  loop
    if v.level <> 'none' and public.vendor_account_in_good_standing(v.vendor_id) then
      perform public.notify(v.vendor_id, 'crm_follow_up',
        case when v.n = 1 then 'Follow-up due: ' || coalesce(admin.alert_text(v.first_title, 80), 'a lead')
             else v.n || ' follow-ups due' end,
        'Open your follow-ups.', null);
      if v.level in ('analytics', 'success') then
        perform public.notify_deliver(v.vendor_id, 'crm_followup',
          jsonb_build_object('name', (select coalesce(nullif(btrim(p.brand_name), ''), 'there') from public.vendor_profiles p where p.id = v.vendor_id),
                             'count', v.n::text),
          'crm_followup:' || v.vendor_id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24'),
          array['whatsapp']);
      end if;
      v_vendors := v_vendors + 1;
      v_due := v_due + v.n;
    end if;
    -- Off the plan or the switch: marked anyway, so it isn't picked up again every run.
    update public.vendor_lead_followups set notified_at = now() where id = any (v.ids);
  end loop;
  return jsonb_build_object('vendors', v_vendors, 'follow_ups', v_due);
end
$function$;

-- ── 8. Entitlements carry it ───────────────────────────────────────────────────────
do $patch$
declare
  v_def text := pg_get_functiondef('public.vendor_entitlements(uuid)'::regprocedure);
  v_old text := $q$      'overseas_tier',      case when paid then coalesce(lim->>'overseas_tier', 'none') else 'none' end$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'vendor_entitlements no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E',\n'
    || $q$      -- The CRM (P8): the level in force where the switch lists the vendor; the pages follow it.$q$ || E'\n'
    || $q$      'crm_level',          case when paid and admin.feature_on_for('crm', p_vendor) then coalesce(lim->>'crm_level', 'none') else 'none' end,$q$ || E'\n'
    || $q$      'crm_pipeline',       paid and admin.feature_on_for('crm', p_vendor) and coalesce(lim->>'crm_level', 'none') in ('pipeline', 'analytics', 'success'),$q$ || E'\n'
    || $q$      'crm_analytics',      paid and admin.feature_on_for('crm', p_vendor) and coalesce(lim->>'crm_level', 'none') in ('analytics', 'success')$q$);
end
$patch$;

-- ── 9. Grants ──────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'admin.vendor_crm_level(uuid)', 'admin.crm_lock(uuid)', 'admin.crm_rfq_for(uuid,uuid)',
    'admin.crm_move(uuid,text,uuid,text)', 'admin.crm_refresh_next(uuid)',
    'admin.crm_insert_lead(uuid,uuid,uuid,text,text,text,numeric,text,text[],uuid)', 'admin.crm_caller(text)',
    'admin.crm_on_quote()', 'admin.crm_on_conversation()', 'admin.crm_on_rfq()',
    'public.crm_followup_run()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.crm_followup_run() to service_role;
  foreach f in array array[
    'public.crm_track(uuid)', 'public.crm_add_lead(text,text,numeric,text[])', 'public.crm_update_lead(uuid,jsonb)',
    'public.crm_delete_lead(uuid)', 'public.crm_add_note(uuid,text)', 'public.crm_add_follow_up(uuid,timestamptz,text)',
    'public.crm_update_follow_up(uuid,boolean,timestamptz)', 'public.crm_delete_follow_up(uuid)',
    'public.crm_analytics(integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Used in check constraints and by the app's sorting: pure functions of their input.
  revoke all on function public.crm_stage_rank(text), public.crm_tags_ok(text[]) from public;
  grant execute on function public.crm_stage_rank(text), public.crm_tags_ok(text[]) to anon, authenticated, service_role;
end
$grants$;

-- ── 10. Self-check ─────────────────────────────────────────────────────────────────
do $check$
begin
  if (select count(*) from public.subscription_plans where limits ? 'crm_level') <> (select count(*) from public.subscription_plans) then
    raise exception 'every plan says its CRM level';
  end if;
  if (select enabled from public.feature_flags where key = 'crm') then
    raise exception 'crm must start switched off';
  end if;
  if position('crm_pipeline' in (select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure)) = 0 then
    raise exception 'the entitlements patch did not apply';
  end if;
  if has_table_privilege('authenticated', 'public.vendor_lead_pipeline', 'INSERT')
     or has_table_privilege('authenticated', 'public.vendor_lead_notes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.vendor_lead_followups', 'DELETE')
     or has_function_privilege('authenticated', 'public.crm_followup_run()', 'EXECUTE')
     or has_function_privilege('anon', 'public.crm_track(uuid)', 'EXECUTE') then
    raise exception 'CRM writes must go through the crm_* functions, and the run is the job''s';
  end if;
  if exists (select 1 from admin.notification_templates t
              where t.key = 'crm_followup' and (t.body ~* 'title|requirement:' or 'title' = any (coalesce(t.wa_params, '{}')))) then
    raise exception 'the follow-up reminder must not carry a buyer''s words';
  end if;
end
$check$;
