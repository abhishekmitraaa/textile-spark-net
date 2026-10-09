-- Subscriptions P6: lead alerts and lead channels (plan "build every vendor subscription
-- feature", 2026-10-09).
--
-- When a buyer posts a requirement to the open marketplace, the vendors it suits are told,
-- each by the channels their plan includes (subscription_plans.limits.lead_alert_channels):
--   Free     nothing (the Leads page only)
--   Basic    a daily email digest
--   Silver   the bell as it happens, and the daily email digest
--   Gold     the bell, email and WhatsApp as it happens (SMS once its provider is set)
--   VIP      as Gold, told first
-- Every plan still sees the same leads on the Leads page; this is only about being told.
--
-- WHO IS TOLD. public.match_rfq_vendors() (RFQ/leads R2) ranks vendors for a requirement by
-- how close their catalogue is and whether they list in its category. A vendor is told when
-- they list in the category, or their catalogue is close enough
-- (admin.lead_alert_config.min_similarity). Never: the buyer's own account, a vendor not in
-- good standing, a requirement sent to one vendor, a removed or closed one, or one older
-- than max_age_hours.
--
-- WHEN. Twice per requirement, from a trigger on rfqs, once each per vendor:
--   * when it is posted: vendors who list in its category (its embedding isn't there yet);
--   * when its embedding arrives: vendors whose catalogue is close.
-- A failure here never stops a requirement being posted: it is recorded and the daily run
-- picks the requirement up.
--
-- NOT TOO MUCH. At most hourly_cap alerts an hour reach a vendor as they happen; in the
-- vendor's quiet hours only the bell rings. What was held goes into the next daily digest.
-- A vendor can turn instant alerts or the digest off, and choose categories.
--
-- THE DIGEST. public.lead_digest_run(): one email per vendor with what matched since the
-- last one. Its schedule is 20261009100100 (a NEW job: Mitra's say-so).
--
-- The lead_alerts switch (off): nobody is told anything until it lists them.
--
-- Harness: scripts/subscriptions/p6_lead_alerts.sql.

-- ── 0. Guard: the function patched here is the one that was read ────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.vendor_entitlements(uuid)'::regprocedure))
     <> 'c7422009590387bc73571b206061522c' then
    raise exception 'public.vendor_entitlements changed since it was read; re-read it before patching';
  end if;
  if md5((select prosrc from pg_proc where oid = 'public.match_rfq_vendors(uuid,integer)'::regprocedure))
     <> '4ea7a5a7e86a0a8a0abc59dda1e79e61' then
    raise exception 'public.match_rfq_vendors changed since it was read; the alert rule relies on what it returns';
  end if;
end
$guard$;

-- ── 1. The switch, and what each plan includes ──────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('lead_alerts',
        'Lead alerts (subscriptions P6): vendors are told when a buyer''s requirement suits them, by the channels their plan includes. Off: nobody is told; the Leads page is unchanged.',
        false)
on conflict (key) do nothing;

update public.subscription_plans set limits = limits || '{"lead_alert_channels": []}'::jsonb where id = 'free';
update public.subscription_plans set limits = limits || '{"lead_alert_channels": ["digest"]}'::jsonb where id = 'basic';
update public.subscription_plans set limits = limits || '{"lead_alert_channels": ["app", "digest"]}'::jsonb where id = 'silver';
update public.subscription_plans set limits = limits || '{"lead_alert_channels": ["app", "email", "whatsapp", "sms"]}'::jsonb where id = 'gold';
update public.subscription_plans set limits = limits || '{"lead_alert_channels": ["app", "email", "whatsapp", "sms"], "lead_alert_priority": true}'::jsonb where id = 'vip';

-- ── 2. Tables ───────────────────────────────────────────────────────────────────────
create table admin.lead_alert_config (
  id             boolean primary key default true check (id),
  min_similarity numeric not null default 0.35 check (min_similarity between 0 and 1),
  max_vendors    integer not null default 50 check (max_vendors between 1 and 200),
  hourly_cap     integer not null default 10 check (hourly_cap between 1 and 100),
  max_age_hours  integer not null default 48 check (max_age_hours between 1 and 168)
);
alter table admin.lead_alert_config enable row level security;
insert into admin.lead_alert_config default values;
comment on table admin.lead_alert_config is
  'One row: how lead alerts are matched and paced. min_similarity: how close a vendor''s catalogue must be when they don''t list in the requirement''s category. max_vendors: how many vendors one requirement may alert. hourly_cap: alerts a vendor gets as they happen in an hour; the rest wait for the digest. max_age_hours: older requirements alert nobody.';

create table public.lead_alert_settings (
  vendor_id    uuid primary key references public.vendor_profiles (id) on delete cascade,
  instant      boolean not null default true,
  digest       boolean not null default true,
  category_ids uuid[] check (category_ids is null or cardinality(category_ids) between 1 and 50),
  quiet_start  time,
  quiet_end    time,
  updated_at   timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);
alter table public.lead_alert_settings enable row level security;
create policy lead_alert_settings_select on public.lead_alert_settings for select
  using (vendor_id = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete on public.lead_alert_settings from anon, authenticated;
comment on table public.lead_alert_settings is
  'A vendor''s own choices about lead alerts (no row: the defaults). instant: told as it happens, by the plan''s channels. digest: the daily email. category_ids: only these categories (null: all). quiet_start/quiet_end: IST; inside them only the bell rings and the rest waits for the digest. Written through set_lead_alert_settings().';

create table admin.lead_alerts (
  id             uuid primary key default gen_random_uuid(),
  rfq_id         uuid not null references public.rfqs (id) on delete cascade,
  vendor_id      uuid not null references public.vendor_profiles (id) on delete cascade,
  score          double precision,
  category_match boolean not null default false,
  plan_id        text not null,
  channels       text[] not null default '{}',
  held           text check (held in ('off', 'digest_only', 'rate_limit', 'quiet_hours')),
  digest_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (rfq_id, vendor_id)
);
alter table admin.lead_alerts enable row level security;
create index lead_alerts_vendor_idx on admin.lead_alerts (vendor_id, created_at desc);
create index lead_alerts_undigested_idx on admin.lead_alerts (vendor_id) where digest_at is null;
comment on table admin.lead_alerts is
  'One row per requirement and vendor told about it: the plan then, the channels it actually went out on as it happened (app for the bell; email, whatsapp, sms where a message was queued), and why it was held when it was (held). digest_at: when the daily digest covered it. The unique key is what makes the second pass (when the embedding arrives) tell only new vendors.';

create table admin.lead_alert_runs (
  rfq_id         uuid primary key references public.rfqs (id) on delete cascade,
  ran_at         timestamptz not null default now(),
  with_embedding boolean not null default false,
  error          text
);
alter table admin.lead_alert_runs enable row level security;
comment on table admin.lead_alert_runs is
  'That a requirement was matched for alerts, whether its embedding was there, and the last error if matching failed (it never stops the requirement being posted). The daily run matches requirements with no row here, or with an error.';

-- ── 3. Matching and telling ─────────────────────────────────────────────────────────
create or replace function admin.lead_alert_fanout(p_rfq uuid)
returns integer
language plpgsql volatile security definer set search_path = '' as $function$
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
  insert into admin.lead_alert_runs (rfq_id, with_embedding) values (p_rfq, r.embedding is not null)
  on conflict (rfq_id) do update
     set ran_at = now(), with_embedding = admin.lead_alert_runs.with_embedding or excluded.with_embedding, error = null;

  select c.name into v_cat from public.categories c where c.id = r.category_id;
  v_title := left(coalesce(nullif(btrim(r.title), ''), nullif(btrim(r.product_name), ''), 'A new requirement'), 120);
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
     -- VIP is told first; then the closest match; between equals, the bigger plan.
     order by coalesce((p.limits ->> 'lead_alert_priority')::boolean, false) desc, x.score desc, p.sort_order desc, x.vendor_id
  loop
    exit when n >= cfg.max_vendors;
    select * into s from public.lead_alert_settings ls where ls.vendor_id = m.vendor_id;
    if s.category_ids is not null and (r.category_id is null or not (r.category_id = any (s.category_ids))) then
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
      v_res := public.notify_deliver(m.vendor_id, 'lead_alert',
        jsonb_build_object(
          'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = m.vendor_id),
          'title', v_title, 'category', coalesce(v_cat, 'Uncategorised'), 'quantity', coalesce(v_qty, 'not given')),
        'lead_alert:' || p_rfq || ':' || m.vendor_id, v_ext);
      v_sent := v_sent || array(select t.k from jsonb_each_text(coalesce(v_res -> 'channels', '{}'::jsonb)) as t(k, v)
                                 where t.v = 'queued' order by t.k);
    end if;
    if cardinality(v_sent) > 0 then
      update admin.lead_alerts set channels = v_sent where id = v_id;
    end if;
  end loop;
  return n;
end
$function$;

-- A requirement posted, or its embedding arriving, runs the matching. It must never stop
-- the buyer's own write, so a failure is recorded and left for the daily run.
create or replace function admin.rfq_lead_alert()
returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op = 'UPDATE' and not (old.embedding is null and new.embedding is not null) then
    return null;
  end if;
  begin
    perform admin.lead_alert_fanout(new.id);
  exception when others then
    insert into admin.lead_alert_runs (rfq_id, with_embedding, error)
    values (new.id, new.embedding is not null, left(sqlstate || ' ' || sqlerrm, 500))
    on conflict (rfq_id) do update set ran_at = now(), error = excluded.error;
  end;
  return null;
end
$function$;
create trigger trg_rfqs_lead_alert after insert or update of embedding on public.rfqs
  for each row execute function admin.rfq_lead_alert();

-- ── 4. The daily run: requirements the trigger missed, then one digest per vendor ───
create or replace function public.lead_digest_run()
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  cfg      admin.lead_alert_config;
  r        record;
  v_caught integer := 0;
  v_sent   integer := 0;
  v_lines  text;
  v_count  integer;
begin
  select * into cfg from admin.lead_alert_config;

  -- Requirements the trigger never matched (it failed, or the switch was turned on since).
  for r in
    select q.id
      from public.rfqs q
      left join admin.lead_alert_runs x on x.rfq_id = q.id
     where q.status::text = 'active' and q.vendor_id is null and q.removed_at is null
       and q.created_at > now() - make_interval(hours => cfg.max_age_hours)
       and q.created_at < now() - interval '10 minutes'
       and (x.rfq_id is null or x.error is not null)
     order by q.created_at
     limit 500
  loop
    begin
      perform admin.lead_alert_fanout(r.id);
      v_caught := v_caught + 1;
    exception when others then
      insert into admin.lead_alert_runs (rfq_id, error) values (r.id, left(sqlstate || ' ' || sqlerrm, 500))
      on conflict (rfq_id) do update set ran_at = now(), error = excluded.error;
    end;
  end loop;

  -- One email per vendor: everything since the last digest on a plan with a digest, or
  -- only what was held (the hourly cap, quiet hours, instant alerts turned off) on a plan
  -- told as it happens.
  for r in
    select a.vendor_id, e.plan_id,
           coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb) ? 'digest' as has_digest,
           coalesce(ls.digest, true) as wants
      from (select distinct vendor_id from admin.lead_alerts where digest_at is null) a
      cross join lateral admin.vendor_effective_plan(a.vendor_id, now()) e
      join public.subscription_plans p on p.id = e.plan_id
      left join public.lead_alert_settings ls on ls.vendor_id = a.vendor_id
  loop
    if r.wants and admin.feature_on_for('lead_alerts', r.vendor_id) then
      select count(*),
             string_agg('- ' || t.title || coalesce(' (' || t.category || ')', ''), E'\n' order by t.created_at desc) filter (where t.rn <= 5)
        into v_count, v_lines
        from (select la.created_at, row_number() over (order by la.created_at desc) as rn,
                     left(coalesce(nullif(btrim(q.title), ''), nullif(btrim(q.product_name), ''), 'A new requirement'), 120) as title,
                     c.name as category
                from admin.lead_alerts la
                join public.rfqs q on q.id = la.rfq_id
                left join public.categories c on c.id = q.category_id
               where la.vendor_id = r.vendor_id and la.digest_at is null
                 and la.created_at > now() - interval '3 days'
                 and q.status::text = 'active' and q.removed_at is null
                 and (r.has_digest or la.held is not null)) t;
      if v_count > 0 then
        perform public.notify_deliver(r.vendor_id, 'lead_digest',
          jsonb_build_object(
            'name', (select coalesce(nullif(btrim(v.brand_name), ''), 'there') from public.vendor_profiles v where v.id = r.vendor_id),
            'count', case when v_count = 1 then '1 new buyer requirement' else v_count || ' new buyer requirements' end,
            'lines', v_lines,
            'more', case when v_count > 5 then 'and ' || (v_count - 5) || ' more on your Leads page.' else '' end),
          'lead_digest:' || r.vendor_id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
          array['email']);
        v_sent := v_sent + 1;
      end if;
    end if;
    update admin.lead_alerts set digest_at = now() where vendor_id = r.vendor_id and digest_at is null;
  end loop;

  return jsonb_build_object('caught_up', v_caught, 'digests', v_sent);
end
$function$;

-- ── 5. The vendor's side ────────────────────────────────────────────────────────────
create or replace function public.set_lead_alert_settings(
  p_instant boolean, p_digest boolean, p_category_ids uuid[], p_quiet_start time, p_quiet_end time)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_me   uuid := auth.uid();
  v_cats uuid[];
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vendor_profiles v where v.id = v_me) then
    raise exception 'Only a vendor has lead alerts.' using errcode = '42501';
  end if;
  if (p_quiet_start is null) <> (p_quiet_end is null) or (p_quiet_start is not null and p_quiet_start = p_quiet_end) then
    raise exception 'Quiet hours need a start and a different end, or neither.' using errcode = '22023';
  end if;
  select array_agg(distinct c.id) into v_cats from public.categories c where c.id = any (coalesce(p_category_ids, '{}'));
  if cardinality(coalesce(v_cats, '{}')) > 50 then
    raise exception 'Choose 50 categories or fewer.' using errcode = '22023';
  end if;
  insert into public.lead_alert_settings as ls (vendor_id, instant, digest, category_ids, quiet_start, quiet_end)
  values (v_me, coalesce(p_instant, true), coalesce(p_digest, true), v_cats, p_quiet_start, p_quiet_end)
  on conflict (vendor_id) do update
     set instant = excluded.instant, digest = excluded.digest, category_ids = excluded.category_ids,
         quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, updated_at = now();
  return jsonb_build_object('ok', true);
end
$function$;

-- What the Lead alerts page shows: whether alerts are the vendor's, by which channels, their
-- choices, the categories they list in, and what they were told lately. live_channels is
-- what is actually being sent today, so the page never promises a channel that is waiting
-- (WhatsApp and SMS for their template approvals, the digest for its scheduled job).
create or replace function public.my_lead_alerts(p_limit integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me    uuid := auth.uid();
  e       record;
  v_lim   jsonb;
  v_name  text;
  s       public.lead_alert_settings;
  v_on    boolean;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  v_on := admin.feature_on_for('lead_alerts', v_me);
  select * into e from admin.vendor_effective_plan(v_me, now());
  select p.name, coalesce(p.limits -> 'lead_alert_channels', '[]'::jsonb) into v_name, v_lim
    from public.subscription_plans p where p.id = e.plan_id;
  select * into s from public.lead_alert_settings ls where ls.vendor_id = v_me;

  return jsonb_build_object(
    'available', v_on and jsonb_array_length(coalesce(v_lim, '[]'::jsonb)) > 0,
    'switch_on', v_on,
    'plan_id', e.plan_id, 'plan_name', v_name,
    'channels', coalesce(v_lim, '[]'::jsonb),
    'live_channels', to_jsonb(array(
      select c from unnest(array['app', 'email', 'whatsapp', 'sms', 'digest']) c
       where case c
               when 'app' then true
               when 'digest' then exists (select 1 from cron.job j where j.jobname = 'lead-alert-digest' and j.active)
                                  and exists (select 1 from admin.notification_templates t where t.key = 'lead_digest' and t.channel = 'email' and t.active)
               else exists (select 1 from admin.notification_templates t where t.key = 'lead_alert' and t.channel = c and t.active)
             end)),
    'settings', jsonb_build_object(
      'instant', coalesce(s.instant, true), 'digest', coalesce(s.digest, true),
      'category_ids', coalesce(to_jsonb(s.category_ids), 'null'::jsonb),
      'quiet_start', to_char(s.quiet_start, 'HH24:MI'), 'quiet_end', to_char(s.quiet_end, 'HH24:MI')),
    'whatsapp_consent', exists (select 1 from public.contact_consent c where c.profile_id = v_me and c.channel = 'whatsapp' and c.opted_in),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
        from public.categories c
       where c.id in (select p.category_id from public.products p where p.vendor_id = v_me and p.status::text = 'live' and p.category_id is not null)), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(x.row order by x.created_at desc)
        from (select la.created_at,
                     jsonb_build_object(
                       'id', la.id, 'rfq_id', la.rfq_id, 'at', la.created_at,
                       'title', left(coalesce(nullif(btrim(q.title), ''), nullif(btrim(q.product_name), ''), 'A new requirement'), 120),
                       'category', c.name, 'quantity', q.quantity,
                       'open', q.status::text = 'active' and q.removed_at is null,
                       'channels', to_jsonb(la.channels), 'held', la.held, 'in_digest', la.digest_at is not null) as row
                from admin.lead_alerts la
                join public.rfqs q on q.id = la.rfq_id
                left join public.categories c on c.id = q.category_id
               where la.vendor_id = v_me
               order by la.created_at desc
               limit least(greatest(coalesce(p_limit, 30), 1), 100)) x), '[]'::jsonb));
end
$function$;

-- ── 6. Entitlements carry it ────────────────────────────────────────────────────────
create or replace function public.vendor_entitlements(p_vendor uuid default auth.uid())
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  e        record;
  plan     public.subscription_plans%rowtype;
  v_verified boolean := false;
  v_ad_until timestamptz;
  paid     boolean;
  seal     text := 'none';
  lim      jsonb;
begin
  if p_vendor is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not (coalesce(p_vendor = auth.uid(), false) or coalesce(public.is_admin(), false)
          or coalesce(auth.role() = 'service_role', false)) then
    raise exception 'Only the vendor or an admin can read these entitlements.' using errcode = '42501';
  end if;

  select * into e from admin.vendor_effective_plan(p_vendor, now());
  select * into plan from public.subscription_plans where id = e.plan_id;
  if not found then
    select * into plan from public.subscription_plans where id = 'free';
  end if;
  lim  := coalesce(plan.limits, '{}'::jsonb);
  -- In the grace days the plan is still the vendor's (P4).
  paid := e.status in ('active', 'grace') and plan.id <> 'free';

  select coalesce(v.is_verified, false), v.ad_verified_until into v_verified, v_ad_until
    from public.vendor_profiles v where v.id = p_vendor;

  if paid and coalesce((lim->>'has_verified_badge')::boolean, false) then
    seal := case plan.id when 'vip' then 'vip' when 'gold' then 'gold' else 'verified' end;
  elsif coalesce(v_verified, false) or coalesce(v_ad_until > now(), false) then
    seal := 'verified';
  end if;

  return jsonb_build_object(
    'vendor_id',        p_vendor,
    'plan_id',          plan.id,
    'plan_name',        plan.name,
    'status',           e.status,
    'paid',             paid,
    'billing_cycle',    e.billing_cycle,
    'period_start',     e.period_start,
    'period_end',       e.period_end,
    'grace_until',      case when e.status = 'grace' then e.raw_period_end + admin.grace_interval(p_vendor) end,
    'scheduled_plan_id', e.scheduled_plan_id,
    'scheduled_from',   e.scheduled_from,
    'limits',           lim,
    'features', jsonb_build_object(
      'product_cap',        coalesce((lim->>'product_cap')::int, 0),
      'ad_location_scope',  coalesce(lim->>'ad_location_scope', 'none'),
      'search_boost_tier',  coalesce((lim->>'search_boost_tier')::int, 0),
      'seal_tier',          seal,
      'crm',                paid and coalesce((lim->>'has_crm')::boolean, false),
      'realtime_alerts',    paid and coalesce((lim->>'has_realtime_alerts')::boolean, false),
      'account_manager',    paid and coalesce((lim->>'has_dedicated_am')::boolean, false),
      'auto_catalog',       coalesce((lim->>'has_auto_catalog')::boolean, false),
      'international',      paid and coalesce((lim->>'has_international')::boolean, false),
      -- Lead alerts (P6): the page is the vendor's when the plan has a channel and the switch lists them.
      'lead_alerts',        paid and jsonb_array_length(coalesce(lim->'lead_alert_channels', '[]'::jsonb)) > 0
                              and admin.feature_on_for('lead_alerts', p_vendor),
      'lead_alert_channels', case when paid then coalesce(lim->'lead_alert_channels', '[]'::jsonb) else '[]'::jsonb end
    )
  );
end;
$function$;

-- ── 7. What the messages say ────────────────────────────────────────────────────────
insert into admin.notification_templates (key, channel, locale, subject, body, cta_label, cta_path, transactional, email_switch)
values
  ('lead_alert', 'email', 'en',
   'New buyer requirement: {{title}}',
   E'Hello {{name}},\n\nA buyer has just posted a requirement that matches what you sell.\n\n{{title}}\nCategory: {{category}}\nQuantity: {{quantity}}\n\nThe first quotes a buyer receives get the most attention. Open your leads to send yours.',
   'Open my leads', '/leads', false, 'emailNewRfq'),
  ('lead_digest', 'email', 'en',
   '{{count}} on Cosora',
   E'Hello {{name}},\n\n{{count}} matched what you sell since your last summary:\n\n{{lines}}\n\n{{more}}',
   'Open my leads', '/leads', false, 'emailNewRfq');
-- WhatsApp and SMS wait for their approvals (Meta's template of this name and these
-- parameters: {{1}} name, {{2}} title, {{3}} category, {{4}} quantity; a DLT template id
-- for SMS): inactive until then.
insert into admin.notification_templates (key, channel, locale, body, wa_template, wa_language, wa_params, transactional, active)
values ('lead_alert', 'whatsapp', 'en',
        'Hello {{name}}, a buyer just posted a requirement that matches what you sell: {{title}} ({{category}}, quantity {{quantity}}). Open your leads on Cosora to send a quote.',
        'new_lead_alert', 'en', array['name', 'title', 'category', 'quantity'], false, false);
insert into admin.notification_templates (key, channel, locale, body, transactional, active)
values ('lead_alert', 'sms', 'en', 'Cosora: new buyer requirement, {{title}} ({{category}}). Open your leads to quote.', false, false);

-- ── 8. Cosora-Admin: is it working ──────────────────────────────────────────────────
create or replace function public.admin_lead_alert_stats(p_days integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90));
begin
  if not (coalesce(public.is_admin(), false) and public.admin_role() in ('super_admin', 'manager', 'support')) then
    raise exception 'Lead alert figures are for super admins, managers and support.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'since', v_since,
    'requirements_matched', (select count(*) from admin.lead_alert_runs r where r.ran_at >= v_since and r.error is null),
    'match_errors', (select count(*) from admin.lead_alert_runs r where r.error is not null),
    'alerts', (select count(*) from admin.lead_alerts a where a.created_at >= v_since),
    'vendors_told', (select count(distinct a.vendor_id) from admin.lead_alerts a where a.created_at >= v_since),
    'as_it_happened', (select count(*) from admin.lead_alerts a where a.created_at >= v_since and cardinality(a.channels) > 0),
    'held', coalesce((select jsonb_object_agg(h.held, h.n) from (
               select a.held, count(*) as n from admin.lead_alerts a
                where a.created_at >= v_since and a.held is not null group by a.held) h), '{}'::jsonb),
    'waiting_for_digest', (select count(*) from admin.lead_alerts a where a.digest_at is null),
    'last_error', (select jsonb_build_object('rfq_id', r.rfq_id, 'at', r.ran_at, 'error', r.error)
                     from admin.lead_alert_runs r where r.error is not null order by r.ran_at desc limit 1));
end
$function$;

-- ── 9. Grants ───────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array['admin.lead_alert_fanout(uuid)', 'admin.rfq_lead_alert()', 'public.lead_digest_run()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function public.lead_digest_run() to service_role;
  foreach f in array array[
    'public.set_lead_alert_settings(boolean,boolean,uuid[],time,time)', 'public.my_lead_alerts(integer)',
    'public.admin_lead_alert_stats(integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  grant select on public.lead_alert_settings to authenticated;
end
$grants$;

-- ── 10. Self-check ──────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array['admin.lead_alert_fanout(uuid)', 'admin.rfq_lead_alert()', 'public.lead_digest_run()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.lead_alert_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.lead_alert_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.lead_alert_settings', 'DELETE') then
    raise exception 'lead_alert_settings is written only through set_lead_alert_settings()';
  end if;
  if (select count(*) from public.subscription_plans where limits ? 'lead_alert_channels') <> (select count(*) from public.subscription_plans) then
    raise exception 'every plan says which lead alert channels it includes';
  end if;
  if (select enabled from public.feature_flags where key = 'lead_alerts') then
    raise exception 'lead_alerts must start switched off';
  end if;
end
$check$;
