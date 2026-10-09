-- Subscriptions P9: account managers and priority support (plan "build every vendor
-- subscription feature", 2026-10-09). Needs 20261009130000 (the account_manager role).
--
-- LEVELS (subscription_plans.limits.am_level): Free and Basic none; Silver 'shared' (the
-- Cosora account team); Gold 'named' (a named manager, once assigned); VIP 'vip' (named,
-- plus the sales concierge and a monthly success review). In force where the
-- `account_managers` switch lists the vendor.
--
-- STAFF. A new admin role, account_manager, which a manager may also give (a team role).
-- Super admins and managers assign a named manager to a vendor (history kept,
-- public.vendor_account_managers). An account manager serves the vendors they are named for,
-- and the shared team: every entitled vendor without a named manager.
--
-- WHAT THE VENDOR GETS (page /account-manager): who looks after them (a named manager's
-- first name and photo on Gold and VIP; "Cosora account team" otherwise), a message thread
-- with them, a callback request, and on VIP the concierge's notes (requirements picked for
-- them) and the monthly success review.
--
-- WHY NOT THE SUPPORT TABLES (a change from the plan, for Mitra to confirm): Help & Support's
-- rollout is Off in production and every requester function checks it, so building on it
-- meant patching that live system throughout. This thread is its own (messages, callbacks,
-- notes), read by the vendor under RLS and written only through the functions below.
--
-- PRIORITY SUPPORT. Help & Support's queue puts Gold's and VIP's waiting requests first
-- (one line added to admin_support_list's ordering; its columns are unchanged), and
-- admin_support_priorities() tells staff the tier and the first-reply target (VIP 1 hour,
-- Gold 4 hours, counted from when support is open).
--
-- Harness: scripts/subscriptions/p9_account_managers.sql.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
declare
  r record;
begin
  if not exists (select 1 from pg_enum where enumtypid = 'public.admin_role_type'::regtype and enumlabel = 'account_manager') then
    raise exception 'apply 20261009130000 (the account_manager role) first';
  end if;
  for r in
    select * from (values
      ('admin.is_team_role(public.admin_role_type)', '8ea276c1da9c899e3ce33f76b36f0e07'),
      ('public.admin_support_list(text,text,text,text,text,text,boolean,integer,integer)', '80b5bccd5e6876a60eac9b055f772390'),
      ('public.admin_support_counts()', '939873de2aca8f6c48b8b3619781fb9f'),
      ('public.vendor_entitlements(uuid)', 'd9db97f304f9c14d38020a134efa9844')
    ) as t(fn, want)
  loop
    if md5((select prosrc from pg_proc where oid = r.fn::regprocedure)) <> r.want then
      raise exception '% changed since it was read; re-read it before patching', r.fn;
    end if;
  end loop;
end
$guard$;

-- ── 1. The switch, each plan's level, the role ─────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('account_managers',
        'Account managers and priority support (subscriptions P9): the Account manager page, its messages, callbacks and (VIP) concierge and success reviews, and Gold and VIP first in the support queue, for vendors this lists. Off: none of it, for anyone.',
        false)
on conflict (key) do nothing;

update public.subscription_plans set limits = limits || '{"am_level": "none", "support_priority": 0}'::jsonb where id not in ('silver', 'gold', 'vip');
update public.subscription_plans set limits = limits || '{"am_level": "shared", "support_priority": 0}'::jsonb where id = 'silver';
update public.subscription_plans set limits = limits || '{"am_level": "named", "support_priority": 1}'::jsonb where id = 'gold';
update public.subscription_plans set limits = limits || '{"am_level": "vip", "support_priority": 2}'::jsonb where id = 'vip';

-- A manager may also give the account manager role (as the five team roles).
create or replace function admin.is_team_role(p_role public.admin_role_type)
returns boolean
language sql immutable set search_path = '' as $function$
  select p_role in ('product_moderator', 'vendor_ops', 'ads_moderator', 'finance_admin', 'support', 'account_manager')
$function$;

-- 'none', 'shared', 'named' or 'vip': the plan in force (the grace days count), where the
-- switch lists the vendor.
create or replace function admin.vendor_am_level(p_vendor uuid)
returns text
language sql stable security definer set search_path = '' as $function$
  select case when p_vendor is null or not admin.feature_on_for('account_managers', p_vendor) then 'none'
              else coalesce((
                select case p.limits ->> 'am_level' when 'shared' then 'shared' when 'named' then 'named'
                                                    when 'vip' then 'vip' else 'none' end
                  from admin.vendor_effective_plan(p_vendor, now()) e
                  join public.subscription_plans p on p.id = e.plan_id
                 where e.status in ('active', 'grace') and p.id <> 'free'), 'none') end
$function$;

-- ── 2. Tables ──────────────────────────────────────────────────────────────────────
create table public.vendor_account_managers (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendor_profiles (id) on delete cascade,
  manager_id  uuid not null references admin.admin_users (id),
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  ended_at    timestamptz,
  ended_by    uuid
);
create unique index vendor_account_managers_current on public.vendor_account_managers (vendor_id) where ended_at is null;
create index vendor_account_managers_manager on public.vendor_account_managers (manager_id) where ended_at is null;
comment on table public.vendor_account_managers is
  'Who is a vendor''s named account manager (subscriptions P9). One current row per vendor (ended_at null); earlier rows are the history. Written only by admin_am_assign(); no one reads it directly.';

-- Times here are clock_timestamp(), like the messages', so read marks and messages compare
-- correctly even within one transaction.
create table public.account_manager_threads (
  vendor_id      uuid primary key references public.vendor_profiles (id) on delete cascade,
  last_message_at timestamptz,
  last_vendor_at timestamptz,
  last_staff_at  timestamptz,
  vendor_read_at timestamptz,
  staff_read_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table public.account_manager_messages (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references public.vendor_profiles (id) on delete cascade,
  author_kind  text not null check (author_kind in ('vendor', 'staff')),
  author_id    uuid,
  author_label text not null check (char_length(author_label) between 1 and 120),
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at   timestamptz not null default clock_timestamp()
);
create index account_manager_messages_vendor on public.account_manager_messages (vendor_id, created_at desc);

create table public.account_manager_callbacks (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references public.vendor_profiles (id) on delete cascade,
  preferred_date date not null,
  time_window    text not null check (time_window in ('morning', 'afternoon', 'evening')),
  note           text check (note is null or char_length(note) <= 280),
  status         text not null default 'requested' check (status in ('requested', 'done', 'missed', 'cancelled')),
  handled_by     uuid,
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);
create unique index account_manager_callbacks_open on public.account_manager_callbacks (vendor_id) where status = 'requested';

create table public.account_manager_notes (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references public.vendor_profiles (id) on delete cascade,
  kind         text not null check (kind in ('concierge', 'success_review')),
  author_id    uuid,
  author_label text not null check (char_length(author_label) between 1 and 120),
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  rfq_id       uuid references public.rfqs (id) on delete set null,
  period       date check (period is null or extract(day from period) = 1),
  created_at   timestamptz not null default clock_timestamp()
);
create index account_manager_notes_vendor on public.account_manager_notes (vendor_id, kind, created_at desc);
comment on table public.account_manager_notes is
  'What an account manager writes to a VIP vendor (subscriptions P9): concierge notes (a requirement picked for them, rfq_id) and the monthly success review (period = the month). The vendor reads their own.';

alter table public.vendor_account_managers enable row level security;
alter table public.account_manager_threads enable row level security;
alter table public.account_manager_messages enable row level security;
alter table public.account_manager_callbacks enable row level security;
alter table public.account_manager_notes enable row level security;
create policy account_manager_threads_select on public.account_manager_threads for select using (vendor_id = (select auth.uid()));
create policy account_manager_messages_select on public.account_manager_messages for select using (vendor_id = (select auth.uid()));
create policy account_manager_callbacks_select on public.account_manager_callbacks for select using (vendor_id = (select auth.uid()));
create policy account_manager_notes_select on public.account_manager_notes for select using (vendor_id = (select auth.uid()));
revoke all on public.vendor_account_managers, public.account_manager_threads, public.account_manager_messages,
              public.account_manager_callbacks, public.account_manager_notes from anon, authenticated;
grant select on public.account_manager_threads, public.account_manager_messages, public.account_manager_callbacks,
               public.account_manager_notes to authenticated;

-- Staff changes are in the Admin Log.
create trigger trg_admin_audit after insert or update or delete on public.vendor_account_managers
  for each row execute function admin.audit_row_change();
create trigger trg_admin_audit after insert or update or delete on public.account_manager_notes
  for each row execute function admin.audit_row_change();
create trigger trg_admin_audit after update on public.account_manager_callbacks
  for each row execute function admin.audit_row_change();

-- ── 3. Helpers ─────────────────────────────────────────────────────────────────────
create or replace function admin.am_named_manager(p_vendor uuid)
returns uuid
language sql stable security definer set search_path = '' as $function$
  select m.manager_id from public.vendor_account_managers m
    join admin.admin_users a on a.id = m.manager_id and a.is_active and a.admin_role = 'account_manager'
   where m.vendor_id = p_vendor and m.ended_at is null
$function$;

-- A staff member's first name, as a vendor sees it.
create or replace function admin.am_first_name(p_staff uuid)
returns text
language sql stable security definer set search_path = '' as $function$
  select coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Your account manager')
    from public.profiles p where p.id = p_staff
$function$;

-- How a staff member's words are signed to this vendor: their first name when they are the
-- vendor's named manager on a named or VIP level; otherwise the team.
create or replace function admin.am_staff_label(p_staff uuid, p_vendor uuid)
returns text
language sql stable security definer set search_path = '' as $function$
  select case when admin.vendor_am_level(p_vendor) in ('named', 'vip') and admin.am_named_manager(p_vendor) = p_staff
              then admin.am_first_name(p_staff) else 'Cosora account team' end
$function$;

-- The caller, when they are active staff who serve vendors (super admin, manager, account manager).
create or replace function admin.am_staff()
returns uuid
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from admin.admin_users a where a.id = v_me and a.is_active
                                    and a.admin_role in ('super_admin', 'manager', 'account_manager')) then
    raise exception 'Account managers, managers and super admins only.' using errcode = '42501';
  end if;
  return v_me;
end
$function$;

-- Whether this staff member serves this vendor: super admins and managers serve everyone; an
-- account manager their named vendors, and the shared team (an entitled vendor with no named
-- manager).
create or replace function admin.am_serves(p_staff uuid, p_vendor uuid)
returns boolean
language sql stable security definer set search_path = '' as $function$
  select coalesce((select case a.admin_role
                            when 'super_admin' then true
                            when 'manager' then true
                            when 'account_manager' then admin.vendor_am_level(p_vendor) <> 'none'
                                                        and coalesce(admin.am_named_manager(p_vendor) = p_staff,
                                                                     admin.am_named_manager(p_vendor) is null)
                            else false end
                     from admin.admin_users a where a.id = p_staff and a.is_active), false)
$function$;

create or replace function admin.am_require_serves(p_vendor uuid)
returns uuid
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_staff();
begin
  if not admin.am_serves(v_me, p_vendor) then
    raise exception 'That vendor isn''t one you look after.' using errcode = '42501';
  end if;
  return v_me;
end
$function$;

-- The vendor caller, with their level (or a refusal).
create or replace function admin.am_vendor(p_min text default 'shared')
returns uuid
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := auth.uid();
  v_level text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_level := admin.vendor_am_level(v_me);
  if v_level = 'none' then
    raise exception 'An account manager comes with the Silver, Gold and VIP plans.' using errcode = '42501';
  end if;
  if p_min = 'vip' and v_level <> 'vip' then
    raise exception 'The sales concierge and success reviews come with VIP.' using errcode = '42501';
  end if;
  return v_me;
end
$function$;

-- One vendor's thread writes at a time (the message rate is counted under it).
create or replace function admin.am_lock(p_vendor uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_wait text := current_setting('lock_timeout');
begin
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(hashtextextended('cosora.am:' || p_vendor::text, 0));
  perform set_config('lock_timeout', v_wait, true);
end
$function$;

-- ── 4. The vendor's side ───────────────────────────────────────────────────────────
-- Who looks after the caller, and what is waiting for them.
create or replace function public.my_account_manager()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me    uuid := auth.uid();
  v_level text;
  v_mgr   uuid;
  t       public.account_manager_threads%rowtype;
  c       public.account_manager_callbacks%rowtype;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_level := admin.vendor_am_level(v_me);
  if v_level = 'none' then
    return jsonb_build_object('available', false, 'level', 'none');
  end if;
  v_mgr := case when v_level in ('named', 'vip') then admin.am_named_manager(v_me) end;
  select * into t from public.account_manager_threads x where x.vendor_id = v_me;
  select * into c from public.account_manager_callbacks x where x.vendor_id = v_me and x.status = 'requested';
  return jsonb_build_object(
    'available', true,
    'level', v_level,
    'manager', case when v_mgr is null then null
                    else jsonb_build_object('name', admin.am_first_name(v_mgr),
                                            'photo', (select p.avatar_url from public.profiles p where p.id = v_mgr)) end,
    'unread', (select count(*) from public.account_manager_messages m
                where m.vendor_id = v_me and m.author_kind = 'staff' and m.created_at > coalesce(t.vendor_read_at, '-infinity')),
    'callback', case when c.id is null then null
                     else jsonb_build_object('id', c.id, 'date', c.preferred_date, 'window', c.time_window, 'note', c.note) end,
    'concierge', v_level = 'vip');
end
$function$;

create or replace function public.am_send(p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_vendor();
  v_id uuid;
begin
  if nullif(btrim(coalesce(p_body, '')), '') is null or char_length(p_body) > 4000 then
    raise exception 'A message is 1 to 4,000 characters.' using errcode = '22023';
  end if;
  perform admin.am_lock(v_me);
  if (select count(*) from public.account_manager_messages m
       where m.vendor_id = v_me and m.author_kind = 'vendor' and m.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'That''s a lot of messages in an hour. Your account team will reply to those first.' using errcode = 'P0001';
  end if;
  insert into public.account_manager_messages (vendor_id, author_kind, author_id, author_label, body)
  values (v_me, 'vendor', v_me,
          coalesce((select nullif(btrim(v.brand_name), '') from public.vendor_profiles v where v.id = v_me), 'Vendor'), btrim(p_body))
  returning id into v_id;
  insert into public.account_manager_threads as t (vendor_id, last_message_at, last_vendor_at, vendor_read_at)
  values (v_me, clock_timestamp(), clock_timestamp(), clock_timestamp())
  on conflict (vendor_id) do update set last_message_at = clock_timestamp(), last_vendor_at = clock_timestamp(), vendor_read_at = clock_timestamp();
  return v_id;
end
$function$;

create or replace function public.am_mark_read()
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_vendor();
begin
  insert into public.account_manager_threads as t (vendor_id, vendor_read_at) values (v_me, clock_timestamp())
  on conflict (vendor_id) do update set vendor_read_at = clock_timestamp();
end
$function$;

create or replace function public.am_request_callback(p_date date, p_window text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me    uuid := admin.am_vendor();
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_id    uuid;
begin
  if p_date is null or p_date < v_today or p_date > v_today + 30 then
    raise exception 'Choose a day in the next 30 days.' using errcode = '22023';
  end if;
  if p_window not in ('morning', 'afternoon', 'evening') then
    raise exception 'Choose morning, afternoon or evening.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 280 then
    raise exception 'A note is up to 280 characters.' using errcode = '22023';
  end if;
  perform admin.am_lock(v_me);
  if exists (select 1 from public.account_manager_callbacks c where c.vendor_id = v_me and c.status = 'requested') then
    raise exception 'You already have a call booked. Cancel it to choose another time.' using errcode = 'P0001';
  end if;
  insert into public.account_manager_callbacks (vendor_id, preferred_date, time_window, note)
  values (v_me, p_date, p_window, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end
$function$;

create or replace function public.am_cancel_callback(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_vendor();
begin
  update public.account_manager_callbacks set status = 'cancelled', handled_at = now()
   where id = p_id and vendor_id = v_me and status = 'requested';
  if not found then
    raise exception 'That call request wasn''t found.' using errcode = 'P0002';
  end if;
end
$function$;

-- ── 5. The staff side (Cosora-Admin, My vendors) ───────────────────────────────────
-- Account managers who can be named.
create or replace function public.admin_am_managers()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  perform admin.am_staff();
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', admin.audit_actor_name(a.id),
                                                       'vendors', (select count(*) from public.vendor_account_managers m
                                                                    where m.manager_id = a.id and m.ended_at is null))
                                    order by admin.audit_actor_name(a.id))
                     from admin.admin_users a where a.is_active and a.admin_role = 'account_manager'), '[]'::jsonb);
end
$function$;

-- The vendors this staff member looks after. p_filter: 'mine' (named for me), 'shared' (no named
-- manager), 'unassigned' (Gold and VIP with no named manager), 'all' (super admins and
-- managers: every entitled vendor).
create or replace function public.admin_am_vendors(p_filter text default 'mine')
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me    uuid := admin.am_staff();
  v_role  public.admin_role_type := (select a.admin_role from admin.admin_users a where a.id = v_me);
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
begin
  if p_filter not in ('mine', 'shared', 'unassigned', 'all') then
    raise exception 'unknown filter %', p_filter using errcode = '22023';
  end if;
  if p_filter = 'all' and v_role = 'account_manager' then
    raise exception 'Managers and super admins only.' using errcode = '42501';
  end if;
  return coalesce((
    with entitled as (
      select s.vendor_id, admin.vendor_am_level(s.vendor_id) as level
        from public.vendor_subscriptions s
       where s.plan_id in (select p.id from public.subscription_plans p where coalesce(p.limits ->> 'am_level', 'none') <> 'none')
    ), v as (
      select e.vendor_id, e.level, admin.am_named_manager(e.vendor_id) as manager_id
        from entitled e where e.level <> 'none'
    ), picked as (
      select v.* from v
       where case p_filter
               when 'mine' then v.manager_id = v_me
               when 'shared' then v.manager_id is null
               when 'unassigned' then v.manager_id is null and v.level in ('named', 'vip')
               else true end
       limit 500
    )
    select jsonb_agg(jsonb_build_object(
             'vendor_id', p.vendor_id,
             'brand_name', vp.brand_name,
             'city', vp.city,
             'level', p.level,
             'plan_id', s.plan_id,
             'status', s.status,
             'period_end', s.current_period_end,
             'auto_renew', s.auto_renew,
             'manager_id', p.manager_id,
             'manager_name', case when p.manager_id is not null then admin.audit_actor_name(p.manager_id) end,
             'unread', (select count(*) from public.account_manager_messages m
                         where m.vendor_id = p.vendor_id and m.author_kind = 'vendor' and m.created_at > coalesce(t.staff_read_at, '-infinity')),
             'last_message_at', t.last_message_at,
             'callback', (select jsonb_build_object('id', c.id, 'date', c.preferred_date, 'window', c.time_window)
                            from public.account_manager_callbacks c where c.vendor_id = p.vendor_id and c.status = 'requested'),
             'pipeline', (select jsonb_build_object('open', count(*) filter (where l.stage not in ('won', 'lost')),
                                                    'open_value', coalesce(sum(l.value_inr) filter (where l.stage not in ('won', 'lost')), 0),
                                                    'won_30d', count(*) filter (where l.stage = 'won' and l.closed_at > now() - interval '30 days'))
                            from public.vendor_lead_pipeline l where l.vendor_id = p.vendor_id),
             'review_due', p.level = 'vip' and not exists (select 1 from public.account_manager_notes n
                                                           where n.vendor_id = p.vendor_id and n.kind = 'success_review' and n.period = v_month))
             order by (select count(*) from public.account_manager_messages m
                        where m.vendor_id = p.vendor_id and m.author_kind = 'vendor' and m.created_at > coalesce(t.staff_read_at, '-infinity')) desc,
                      t.last_message_at desc nulls last, vp.brand_name)
      from picked p
      join public.vendor_profiles vp on vp.id = p.vendor_id
      left join public.vendor_subscriptions s on s.vendor_id = p.vendor_id
      left join public.account_manager_threads t on t.vendor_id = p.vendor_id
     where admin.am_serves(v_me, p.vendor_id)), '[]'::jsonb);
end
$function$;

-- One vendor, for the staff member who serves them: messages, callbacks, notes, history.
create or replace function public.admin_am_vendor(p_vendor uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_require_serves(p_vendor);
begin
  return jsonb_build_object(
    'vendor_id', p_vendor,
    'brand_name', (select v.brand_name from public.vendor_profiles v where v.id = p_vendor),
    'level', admin.vendor_am_level(p_vendor),
    'manager_id', admin.am_named_manager(p_vendor),
    'manager_name', (select admin.audit_actor_name(admin.am_named_manager(p_vendor))),
    'you_sign_as', admin.am_staff_label(v_me, p_vendor),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_kind', m.author_kind, 'author_label', m.author_label,
                                                              'author_name', case when m.author_kind = 'staff' then admin.audit_actor_name(m.author_id) end,
                                                              'body', m.body, 'created_at', m.created_at) order by m.created_at)
                            from (select * from public.account_manager_messages x where x.vendor_id = p_vendor
                                   order by x.created_at desc limit 200) m), '[]'::jsonb),
    'callbacks', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'date', c.preferred_date, 'window', c.time_window,
                                                               'note', c.note, 'status', c.status, 'created_at', c.created_at) order by c.created_at desc)
                             from (select * from public.account_manager_callbacks x where x.vendor_id = p_vendor
                                    order by x.created_at desc limit 20) c), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'rfq_id', n.rfq_id,
                                                           'period', n.period, 'author_label', n.author_label, 'created_at', n.created_at)
                                        order by n.created_at desc)
                         from (select * from public.account_manager_notes x where x.vendor_id = p_vendor
                                order by x.created_at desc limit 50) n), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('manager', admin.audit_actor_name(h.manager_id), 'from', h.assigned_at,
                                                             'to', h.ended_at, 'by', case when h.assigned_by is not null then admin.audit_actor_name(h.assigned_by) end)
                                          order by h.assigned_at desc)
                           from public.vendor_account_managers h where h.vendor_id = p_vendor), '[]'::jsonb));
end
$function$;

create or replace function public.admin_am_send(p_vendor uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me    uuid := admin.am_require_serves(p_vendor);
  v_label text;
  v_id    uuid;
begin
  if nullif(btrim(coalesce(p_body, '')), '') is null or char_length(p_body) > 4000 then
    raise exception 'A message is 1 to 4,000 characters.' using errcode = '22023';
  end if;
  v_label := admin.am_staff_label(v_me, p_vendor);
  insert into public.account_manager_messages (vendor_id, author_kind, author_id, author_label, body)
  values (p_vendor, 'staff', v_me, v_label, btrim(p_body))
  returning id into v_id;
  insert into public.account_manager_threads as t (vendor_id, last_message_at, last_staff_at, staff_read_at)
  values (p_vendor, clock_timestamp(), clock_timestamp(), clock_timestamp())
  on conflict (vendor_id) do update set last_message_at = clock_timestamp(), last_staff_at = clock_timestamp(), staff_read_at = clock_timestamp();
  -- The bell says who wrote; the message is read in the app.
  perform public.notify(p_vendor, 'account_manager_message',
    case when v_label = 'Cosora account team' then 'A message from your Cosora account team' else 'A message from ' || v_label || ', your account manager' end,
    'Open it on your Account manager page.', null);
  return v_id;
end
$function$;

create or replace function public.admin_am_mark_read(p_vendor uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_require_serves(p_vendor);
begin
  insert into public.account_manager_threads as t (vendor_id, staff_read_at) values (p_vendor, clock_timestamp())
  on conflict (vendor_id) do update set staff_read_at = clock_timestamp();
end
$function$;

create or replace function public.admin_am_callback_set(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_vendor uuid;
  v_me uuid;
begin
  select c.vendor_id into v_vendor from public.account_manager_callbacks c where c.id = p_id;
  if v_vendor is null then
    raise exception 'That call request wasn''t found.' using errcode = 'P0002';
  end if;
  v_me := admin.am_require_serves(v_vendor);
  if p_status not in ('done', 'missed') then
    raise exception 'A call is done or missed.' using errcode = '22023';
  end if;
  update public.account_manager_callbacks set status = p_status, handled_by = v_me, handled_at = now()
   where id = p_id and status = 'requested';
  if not found then
    raise exception 'That call request is already closed.' using errcode = 'P0001';
  end if;
  if p_status = 'missed' then
    perform public.notify(v_vendor, 'account_manager_message', 'Your account team couldn''t reach you',
      'Book another time on your Account manager page.', null);
  end if;
end
$function$;

-- VIP: requirements from the last 72 hours in the vendor's categories that they can see.
create or replace function public.admin_am_concierge(p_vendor uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_require_serves(p_vendor);
  v_tier text := admin.vendor_overseas_tier(p_vendor);
begin
  if admin.vendor_am_level(p_vendor) <> 'vip' then
    raise exception 'The sales concierge is for VIP vendors.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('rfq_id', r.id, 'title', r.title, 'category', c.name, 'quantity', r.quantity,
                                        'created_at', r.created_at, 'overseas', r.overseas,
                                        'quoted', exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_vendor),
                                        'noted', exists (select 1 from public.account_manager_notes n where n.vendor_id = p_vendor and n.rfq_id = r.id))
                     order by r.created_at desc)
      from (select * from public.rfqs x
             where x.status::text = 'active' and x.vendor_id is null and x.removed_at is null
               and x.created_at > now() - interval '72 hours' and x.buyer_id <> p_vendor
               and x.category_id in (select pr.category_id from public.products pr where pr.vendor_id = p_vendor and pr.status::text = 'live')
               and public.overseas_rfq_visible(x.overseas, x.overseas_vip_until, v_tier)
             order by x.created_at desc limit 10) r
      left join public.categories c on c.id = r.category_id), '[]'::jsonb);
end
$function$;

-- A concierge note (optionally pointing at a requirement the vendor can see) or the month's
-- success review, to a VIP vendor.
create or replace function public.admin_am_note(p_vendor uuid, p_kind text, p_body text, p_rfq uuid default null, p_period date default null)
returns uuid
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_require_serves(p_vendor);
  v_period date;
  v_id uuid;
begin
  if admin.vendor_am_level(p_vendor) <> 'vip' then
    raise exception 'Concierge notes and success reviews are for VIP vendors.' using errcode = '42501';
  end if;
  if p_kind not in ('concierge', 'success_review') then
    raise exception 'A note is a concierge note or a success review.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null or char_length(p_body) > 4000 then
    raise exception 'A note is 1 to 4,000 characters.' using errcode = '22023';
  end if;
  if p_rfq is not null and (p_kind <> 'concierge' or not exists (select 1 from admin.crm_rfq_for(p_vendor, p_rfq))) then
    raise exception 'That requirement isn''t one this vendor can quote on.' using errcode = '22023';
  end if;
  if p_kind = 'success_review' then
    v_period := date_trunc('month', coalesce(p_period, (now() at time zone 'Asia/Kolkata')::date))::date;
    if exists (select 1 from public.account_manager_notes n where n.vendor_id = p_vendor and n.kind = 'success_review' and n.period = v_period) then
      raise exception 'This month''s review is already written.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.account_manager_notes (vendor_id, kind, author_id, author_label, body, rfq_id, period)
  values (p_vendor, p_kind, v_me, admin.am_staff_label(v_me, p_vendor), btrim(p_body), p_rfq, v_period)
  returning id into v_id;
  perform public.notify(p_vendor, 'account_manager_note',
    case p_kind when 'concierge' then 'Your account manager picked a requirement for you' else 'Your monthly review is ready' end,
    'Open it on your Account manager page.', null);
  return v_id;
end
$function$;

-- Name a vendor's account manager, or (p_manager null) return them to the shared team.
-- Super admins and managers only; the manager must hold the account manager role.
create or replace function public.admin_am_assign(p_vendor uuid, p_manager uuid)
returns void
language plpgsql security definer set search_path = '' as $function$
declare
  v_me uuid := admin.am_staff();
begin
  if (select a.admin_role from admin.admin_users a where a.id = v_me) not in ('super_admin', 'manager') then
    raise exception 'Managers and super admins assign account managers.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendor_profiles v where v.id = p_vendor) then
    raise exception 'That vendor wasn''t found.' using errcode = 'P0002';
  end if;
  if p_manager is not null and not exists (select 1 from admin.admin_users a where a.id = p_manager and a.is_active
                                              and a.admin_role = 'account_manager') then
    raise exception 'Choose an active account manager.' using errcode = '22023';
  end if;
  perform admin.am_lock(p_vendor);
  if p_manager is not distinct from (select m.manager_id from public.vendor_account_managers m where m.vendor_id = p_vendor and m.ended_at is null) then
    return;
  end if;
  update public.vendor_account_managers set ended_at = now(), ended_by = v_me where vendor_id = p_vendor and ended_at is null;
  if p_manager is not null then
    insert into public.vendor_account_managers (vendor_id, manager_id, assigned_by) values (p_vendor, p_manager, v_me);
  end if;
end
$function$;

-- ── 6. Priority support ────────────────────────────────────────────────────────────
-- 2 for a VIP vendor, 1 for Gold, 0 otherwise (where the switch lists the vendor).
create or replace function admin.support_requester_priority(p_requester uuid, p_side text)
returns integer
language sql stable security definer set search_path = '' as $function$
  select case when p_side <> 'vendor' or p_requester is null or not admin.feature_on_for('account_managers', p_requester) then 0
              else coalesce((select coalesce((p.limits ->> 'support_priority')::int, 0)
                               from admin.vendor_effective_plan(p_requester, now()) e
                               join public.subscription_plans p on p.id = e.plan_id
                              where e.status in ('active', 'grace') and p.id <> 'free'), 0) end
$function$;

-- The tier and first-reply target of the given requests, for staff who read support.
create or replace function public.admin_support_priorities(p_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  perform admin.support_require_read();
  if cardinality(p_ids) > 200 then
    raise exception 'At most 200 at a time.' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_object_agg(x.id, jsonb_build_object(
             'tier', case x.pr when 2 then 'vip' else 'gold' end,
             'target_at', case when x.awaiting_staff and x.waiting_at is not null then
                            (case when admin.support_is_open_at(x.waiting_at) then x.waiting_at else admin.support_next_open_at(x.waiting_at) end)
                            + case x.pr when 2 then interval '1 hour' else interval '4 hours' end end))
      from (select r.id, r.awaiting_staff, r.waiting_at, admin.support_requester_priority(r.requester_id, r.requester_side) as pr
              from admin.support_ticket_rows r where r.id = any (p_ids)) x
     where x.pr > 0), '{}'::jsonb);
end
$function$;

do $patch$
declare
  v_def text;
  v_old text;
begin
  -- The queue: among requests waiting on staff, VIP and then Gold first.
  v_def := pg_get_functiondef('public.admin_support_list(text,text,text,text,text,text,boolean,integer,integer)'::regprocedure);
  v_old := $q$       case when v_view in ('active', 'awaiting', 'mine', 'unassigned') then f.awaiting_staff end desc nulls last,$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_support_list no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E'\n'
    || $q$       case when v_view in ('active', 'awaiting', 'mine', 'unassigned') and f.awaiting_staff then admin.support_requester_priority(f.requester_id, f.requester_side) end desc nulls last,$q$);

  -- The counts: how many priority requests are waiting.
  v_def := pg_get_functiondef('public.admin_support_counts()'::regprocedure);
  v_old := $q$           'awaiting_feedback', count(*) filter (where r.awaiting_staff and r.channel = 'feedback'),$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'admin_support_counts no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E'\n'
    || $q$           'awaiting_priority', count(*) filter (where r.awaiting_staff and admin.support_requester_priority(r.requester_id, r.requester_side) > 0),$q$);

  -- Entitlements carry the level, and whether the page is theirs.
  v_def := pg_get_functiondef('public.vendor_entitlements(uuid)'::regprocedure);
  v_old := $q$      'crm_analytics',      paid and admin.feature_on_for('crm', p_vendor) and coalesce(lim->>'crm_level', 'none') in ('analytics', 'success')$q$;
  if position(v_old in v_def) = 0 then
    raise exception 'vendor_entitlements no longer has the line this patch extends';
  end if;
  execute replace(v_def, v_old, v_old || E',\n'
    || $q$      -- Account managers (P9): the level in force where the switch lists the vendor.$q$ || E'\n'
    || $q$      'am_level',           case when paid and admin.feature_on_for('account_managers', p_vendor) then coalesce(lim->>'am_level', 'none') else 'none' end,$q$ || E'\n'
    || $q$      'am_page',            paid and admin.feature_on_for('account_managers', p_vendor) and coalesce(lim->>'am_level', 'none') in ('shared', 'named', 'vip')$q$);
end
$patch$;

-- ── 7. Grants ──────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'admin.vendor_am_level(uuid)', 'admin.am_named_manager(uuid)', 'admin.am_first_name(uuid)', 'admin.am_staff_label(uuid,uuid)',
    'admin.am_staff()', 'admin.am_serves(uuid,uuid)', 'admin.am_require_serves(uuid)', 'admin.am_vendor(text)', 'admin.am_lock(uuid)',
    'admin.support_requester_priority(uuid,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.my_account_manager()', 'public.am_send(text)', 'public.am_mark_read()', 'public.am_request_callback(date,text,text)',
    'public.am_cancel_callback(uuid)', 'public.admin_am_managers()', 'public.admin_am_vendors(text)', 'public.admin_am_vendor(uuid)',
    'public.admin_am_send(uuid,text)', 'public.admin_am_mark_read(uuid)', 'public.admin_am_callback_set(uuid,text)',
    'public.admin_am_concierge(uuid)', 'public.admin_am_note(uuid,text,text,uuid,date)', 'public.admin_am_assign(uuid,uuid)',
    'public.admin_support_priorities(uuid[])'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ── 8. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  if not admin.is_team_role('account_manager') or admin.is_team_role('manager') or admin.is_team_role('super_admin') then
    raise exception 'is_team_role must add account_manager and nothing else';
  end if;
  if (select count(*) from public.subscription_plans where limits ? 'am_level' and limits ? 'support_priority')
     <> (select count(*) from public.subscription_plans) then
    raise exception 'every plan says its account manager level and support priority';
  end if;
  if (select enabled from public.feature_flags where key = 'account_managers') then
    raise exception 'account_managers must start switched off';
  end if;
  if position('support_requester_priority' in (select prosrc from pg_proc where oid = 'public.admin_support_list(text,text,text,text,text,text,boolean,integer,integer)'::regprocedure)) = 0
     or position('awaiting_priority' in (select prosrc from pg_proc where oid = 'public.admin_support_counts()'::regprocedure)) = 0
     or position('am_page' in (select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure)) = 0 then
    raise exception 'a patch did not apply';
  end if;
  if has_table_privilege('authenticated', 'public.account_manager_messages', 'INSERT')
     or has_table_privilege('authenticated', 'public.vendor_account_managers', 'SELECT')
     or has_function_privilege('anon', 'public.my_account_manager()', 'EXECUTE') then
    raise exception 'account manager data is written through the functions only, and the assignments are staff''s';
  end if;
end
$check$;
