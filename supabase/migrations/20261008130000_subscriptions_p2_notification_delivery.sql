-- Subscriptions P2: the notification delivery platform (plan "build every vendor subscription
-- feature", 2026-10-08).
--
-- Email (Resend), WhatsApp (Meta's Cloud API) and SMS (adapter only; the provider comes
-- later) from one transactional outbox:
--
--   1. admin.notification_templates: what each message says, per key, channel and language,
--      versioned. A WhatsApp row names the Meta-approved template and the order of its
--      parameters; an SMS row carries its DLT template id (India).
--   2. public.contact_consent: a person's opt-in to WhatsApp and SMS, with when and where it
--      was given (Meta and TRAI require it). Email needs none for account messages.
--   3. admin.notification_outbox: one row per message and channel, written in the same
--      transaction as the event that causes it, so a message is never lost and never sent
--      for something that rolled back. A dedupe key makes "send once" a constraint.
--   4. public.notify_deliver(profile, template, payload, dedupe_key, channels): the one way to
--      queue a message. It checks the notification_delivery switch, the template, consent,
--      the person's email switches and an address, and says why a channel was skipped.
--   5. notification_claim() / notification_mark(): the notification-dispatch function claims
--      due rows (FOR UPDATE SKIP LOCKED, so runs never collide), sends them, and records the
--      outcome: sent; skipped (provider not configured: nothing piles up to go out stale
--      when keys arrive); retried with backoff (1, 5, 30, 120 minutes; 5 attempts); failed.
--      Delivery is at least once: a dispatcher that dies mid-send is reclaimed after 5 minutes.
--   6. The first message: invoice_issued, emailed to the vendor when a plan invoice is issued
--      (not for demo documents). A failure to queue it never blocks the invoice.
--   7. Cosora-Admin System Health: admin_notification_health() and a test send to oneself.
--
-- Off by default: the notification_delivery switch lists test accounts first. The dispatcher's
-- schedule is a separate migration (20261008130100), a new job that needs Mitra's say-so.
--
-- Harness: scripts/subscriptions/p2_notification_delivery.sql.

-- ── 0. The switch ───────────────────────────────────────────────────────────────────
insert into public.feature_flags (key, description, enabled)
values ('notification_delivery',
        'Email, WhatsApp and SMS from the notification outbox (subscriptions P2). Off: nothing is queued for anyone not listed.',
        false)
on conflict (key) do nothing;

-- ── 1. Templates ────────────────────────────────────────────────────────────────────
create table admin.notification_templates (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  channel             text not null check (channel in ('email', 'whatsapp', 'sms')),
  locale              text not null default 'en' check (locale in ('en', 'hi', 'gu')),
  version             integer not null default 1 check (version >= 1),
  subject             text check (subject is null or char_length(subject) <= 200),
  body                text not null check (char_length(body) between 1 and 4000),
  cta_label           text check (cta_label is null or char_length(cta_label) <= 60),
  cta_path            text check (cta_path is null or cta_path ~ '^/'),
  wa_template         text check (wa_template is null or (wa_template ~ '^[a-z0-9_]+$' and char_length(wa_template) <= 512)),
  wa_language         text,
  wa_params           text[] not null default '{}',
  sms_dlt_template_id text,
  transactional       boolean not null default false,
  email_switch        text check (email_switch is null or email_switch ~ '^email[A-Z][A-Za-z]+$'),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (key, channel, locale, version),
  check (channel <> 'email' or subject is not null),
  check (channel <> 'whatsapp' or (wa_template is not null and wa_language is not null))
);
alter table admin.notification_templates enable row level security;
create trigger trg_admin_audit after insert or update or delete on admin.notification_templates
  for each row execute function admin.audit_row_change();
comment on table admin.notification_templates is
  'What each outbound message says, per key, channel (email, whatsapp, sms) and language, versioned: the highest active version is used, and a queued message keeps the version it was queued with. body and subject take {{payload_key}} placeholders. WhatsApp sends the Meta-approved wa_template with wa_params (payload keys) as its {{1}}, {{2}}…; body is only a preview. SMS needs its DLT template id before it may be sent in India. transactional: sent whatever the person''s email switches say (invoices); otherwise email_switch names the vendor_profiles.notifications key that turns it off.';

insert into admin.notification_templates (key, channel, locale, subject, body, cta_label, cta_path, transactional)
values
  ('invoice_issued', 'email', 'en',
   'Your Cosora {{document_label}} {{invoice_number}}',
   E'Hello {{name}},\n\nThank you. Your {{document_label}} {{invoice_number}} for {{total}} is ready: {{plan_name}} plan, {{period}}. {{note}}\n\nYou can view and download it from your Cosora account.',
   'View invoice', '/subscription/invoice/{{invoice_id}}', true),
  ('delivery_test', 'email', 'en',
   'Cosora delivery test',
   E'This is a test from Cosora-Admin''s System Health page, queued {{queued_at}}.\n\nIf it reached you, email delivery works.',
   null, null, true);
insert into admin.notification_templates (key, channel, locale, body, wa_template, wa_language, transactional)
values ('delivery_test', 'whatsapp', 'en', 'Meta''s sample template "hello_world" (every WhatsApp Business account has it).', 'hello_world', 'en_US', true);
insert into admin.notification_templates (key, channel, locale, body, transactional)
values ('delivery_test', 'sms', 'en', 'Cosora delivery test, queued {{queued_at}}.', true);

-- ── 2. Consent ──────────────────────────────────────────────────────────────────────
create table public.contact_consent (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel    text not null check (channel in ('whatsapp', 'sms')),
  opted_in   boolean not null,
  changed_at timestamptz not null default now(),
  source     text not null check (source in ('vendor_settings', 'onboarding', 'admin', 'support')),
  primary key (profile_id, channel)
);
alter table public.contact_consent enable row level security;
revoke all on public.contact_consent from public, anon, authenticated;
grant select on public.contact_consent to authenticated;
create policy contact_consent_select on public.contact_consent
  for select to authenticated using (profile_id = (select auth.uid()));
create trigger trg_admin_audit after insert or update or delete on public.contact_consent
  for each row execute function admin.audit_row_change();
comment on table public.contact_consent is
  'Opt-in to WhatsApp and SMS messages, per person and channel, with when and where it was last given or withdrawn. Written only through set_contact_consent(), which also appends to admin.contact_consent_log. No row means not opted in.';

-- Every change of mind, kept: proof of when someone opted in or out. The Admin Log
-- records only admins' actions, so a person's own choices are logged here.
create table admin.contact_consent_log (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  channel    text not null,
  opted_in   boolean not null,
  source     text not null,
  at         timestamptz not null default now()
);
alter table admin.contact_consent_log enable row level security;
create index contact_consent_log_profile_idx on admin.contact_consent_log (profile_id, at desc);
comment on table admin.contact_consent_log is
  'Append-only history of WhatsApp and SMS opt-ins and opt-outs (set_contact_consent).';

-- ── 3. The outbox ───────────────────────────────────────────────────────────────────
create table admin.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references public.profiles (id) on delete cascade,
  template_id     uuid not null references admin.notification_templates (id),
  template_key    text not null,
  channel         text not null check (channel in ('email', 'whatsapp', 'sms')),
  to_address      text not null,
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text,
  status          text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  provider_id     text,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (dedupe_key, channel)
);
alter table admin.notification_outbox enable row level security;
create index notification_outbox_due_idx on admin.notification_outbox (next_attempt_at) where status in ('queued', 'sending');
create index notification_outbox_profile_idx on admin.notification_outbox (profile_id, created_at desc);
create index notification_outbox_template_idx on admin.notification_outbox (template_id);
create index notification_outbox_recent_idx on admin.notification_outbox (created_at desc);
comment on table admin.notification_outbox is
  'One row per outbound message and channel. Queued in the same transaction as its cause (notify_deliver), sent by notification-dispatch (notification_claim / notification_mark): sent, skipped (provider not configured), retried with backoff, or failed after 5 attempts. At-least-once. Rows finished more than 90 days ago are pruned by the dispatcher''s heartbeat.';

create table admin.notification_dispatcher_state (
  id           boolean primary key default true check (id),
  last_run_at  timestamptz,
  configured   jsonb not null default '{}'::jsonb,
  last_claimed integer not null default 0,
  last_sent    integer not null default 0,
  last_failed  integer not null default 0
);
insert into admin.notification_dispatcher_state (id) values (true);
comment on table admin.notification_dispatcher_state is
  'The last notification-dispatch run: when, how many messages it claimed, sent and failed, and which providers its secrets configure (the database can''t see function secrets).';

-- ── 4. Addresses ────────────────────────────────────────────────────────────────────
-- A phone number as Meta and SMS gateways want it: country code and digits. A 10-digit
-- number is Indian.
create or replace function admin.phone_e164_digits(p text)
returns text
language sql immutable set search_path = '' as $function$
  select case
           when d ~ '^[6-9][0-9]{9}$' then '91' || d
           when d ~ '^0[6-9][0-9]{9}$' then '91' || substr(d, 2)
           when d ~ '^[1-9][0-9]{10,14}$' then d
         end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$function$;

-- Where a person is reached on a channel. Email: a vendor's owner email, else their sign-in
-- email if confirmed and not a phone sign-in placeholder. WhatsApp: the vendor's WhatsApp
-- number, else their phone, else the confirmed sign-in phone. SMS: phone, then sign-in phone.
create or replace function admin.contact_address(p_profile uuid, p_channel text)
returns text
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_vendor record;
  v_user   record;
begin
  select v.owner_email, v.phone, v.whatsapp into v_vendor from public.vendor_profiles v where v.id = p_profile;
  select u.email, u.email_confirmed_at, u.phone, u.phone_confirmed_at into v_user from auth.users u where u.id = p_profile;
  if p_channel = 'email' then
    if nullif(btrim(v_vendor.owner_email), '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return lower(btrim(v_vendor.owner_email));
    end if;
    if v_user.email_confirmed_at is not null and v_user.email is not null
       and v_user.email not ilike '%@phone.cosora.invalid' then
      return lower(v_user.email);
    end if;
    return null;
  elsif p_channel = 'whatsapp' then
    return coalesce(admin.phone_e164_digits(v_vendor.whatsapp), admin.phone_e164_digits(v_vendor.phone),
                    case when v_user.phone_confirmed_at is not null then admin.phone_e164_digits(v_user.phone) end);
  elsif p_channel = 'sms' then
    return coalesce(admin.phone_e164_digits(v_vendor.phone),
                    case when v_user.phone_confirmed_at is not null then admin.phone_e164_digits(v_user.phone) end);
  end if;
  return null;
end
$function$;

-- "a*****@gmail.com", "+91 *******210": enough to recognise, not to harvest.
create or replace function admin.mask_address(p_address text, p_channel text)
returns text
language sql immutable set search_path = '' as $function$
  select case
           when p_address is null then null
           when p_channel = 'email' then
             left(split_part(p_address, '@', 1), 1) || repeat('*', greatest(length(split_part(p_address, '@', 1)) - 1, 1))
             || '@' || split_part(p_address, '@', 2)
           else '+' || left(p_address, length(p_address) - 10) || ' ' || repeat('*', 7) || right(p_address, 3)
         end
$function$;
revoke all on function admin.phone_e164_digits(text) from public, anon, authenticated;
revoke all on function admin.contact_address(uuid, text) from public, anon, authenticated;
revoke all on function admin.mask_address(text, text) from public, anon, authenticated;

-- ── 5. Queueing ─────────────────────────────────────────────────────────────────────
create or replace function public.notify_deliver(
  p_profile    uuid,
  p_template   text,
  p_payload    jsonb,
  p_dedupe_key text default null,
  p_channels   text[] default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_locale   text;
  v_switches jsonb;
  v_out      jsonb := '{}'::jsonb;
  v_queued   integer := 0;
  t          admin.notification_templates;
  ch         text;
  v_addr     text;
  v_id       uuid;
begin
  -- Callers: the service role, and definer functions acting for the database (an invoice,
  -- later a lead). No browser role holds EXECUTE (the self-check below), and a definer
  -- caller may run inside a signed-in user's request, so auth.role() is not the guard.
  if p_profile is null or not public.feature_on_for('notification_delivery', p_profile) then
    return jsonb_build_object('queued', 0, 'reason', 'delivery_off');
  end if;
  -- The account's language (auth metadata ui_language, as the app saves it since
  -- 2026-09-26; vendor_profiles.regional.language is no longer read).
  select u.raw_user_meta_data ->> 'ui_language' into v_locale from auth.users u where u.id = p_profile;
  if v_locale is null or v_locale not in ('en', 'hi', 'gu') then
    v_locale := 'en';
  end if;
  select coalesce(v.notifications, '{}'::jsonb) into v_switches from public.vendor_profiles v where v.id = p_profile;
  v_switches := coalesce(v_switches, '{}'::jsonb);

  foreach ch in array coalesce(p_channels, array['email', 'whatsapp', 'sms']) loop
    -- The person's language, else English; the highest active version.
    select * into t from admin.notification_templates nt
     where nt.key = p_template and nt.channel = ch and nt.active and nt.locale in (v_locale, 'en')
     order by (nt.locale = v_locale) desc, nt.version desc
     limit 1;
    if not found then
      v_out := v_out || jsonb_build_object(ch, 'no_template');
      continue;
    end if;
    if ch in ('whatsapp', 'sms') and not exists (
         select 1 from public.contact_consent c where c.profile_id = p_profile and c.channel = ch and c.opted_in) then
      v_out := v_out || jsonb_build_object(ch, 'no_consent');
      continue;
    end if;
    if ch = 'email' and not t.transactional and t.email_switch is not null
       and (v_switches ->> t.email_switch) = 'false' then
      v_out := v_out || jsonb_build_object(ch, 'switched_off');
      continue;
    end if;
    v_addr := admin.contact_address(p_profile, ch);
    if v_addr is null then
      v_out := v_out || jsonb_build_object(ch, 'no_address');
      continue;
    end if;
    insert into admin.notification_outbox (profile_id, template_id, template_key, channel, to_address, payload, dedupe_key)
    values (p_profile, t.id, p_template, ch, v_addr, coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
    on conflict (dedupe_key, channel) do nothing
    returning id into v_id;
    if v_id is null then
      v_out := v_out || jsonb_build_object(ch, 'duplicate');
    else
      v_queued := v_queued + 1;
      v_out := v_out || jsonb_build_object(ch, 'queued');
    end if;
    v_id := null;
  end loop;
  return jsonb_build_object('queued', v_queued, 'channels', v_out);
end
$function$;

-- ── 6. Dispatching ──────────────────────────────────────────────────────────────────
create or replace function public.notification_claim(p_limit integer default 50)
returns table (id uuid, channel text, to_address text, payload jsonb, template_key text, attempts integer,
               subject text, body text, cta_label text, cta_path text, wa_template text, wa_language text,
               wa_params text[], sms_dlt_template_id text)
language plpgsql volatile security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'notification_claim is for the dispatcher only' using errcode = '42501';
  end if;
  return query
    with c as (
      select o.id from admin.notification_outbox o
       where (o.status = 'queued' and o.next_attempt_at <= now())
          or (o.status = 'sending' and o.locked_until < now())
       order by o.next_attempt_at
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
       for update skip locked
    ), u as (
      update admin.notification_outbox o
         set status = 'sending', attempts = o.attempts + 1, locked_until = now() + interval '5 minutes'
        from c where o.id = c.id
      returning o.*
    )
    select u.id, u.channel, u.to_address, u.payload, u.template_key, u.attempts,
           t.subject, t.body, t.cta_label, t.cta_path, t.wa_template, t.wa_language, t.wa_params, t.sms_dlt_template_id
      from u join admin.notification_templates t on t.id = u.template_id;
end
$function$;

create or replace function public.notification_mark(p_id uuid, p_outcome text, p_provider_id text default null, p_error text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_status text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'notification_mark is for the dispatcher only' using errcode = '42501';
  end if;
  update admin.notification_outbox o
     set status = case p_outcome
                    when 'sent' then 'sent'
                    when 'not_configured' then 'skipped'
                    when 'failed' then 'failed'
                    when 'retry' then case when o.attempts >= 5 then 'failed' else 'queued' end
                  end,
         sent_at = case when p_outcome = 'sent' then now() end,
         provider_id = coalesce(p_provider_id, o.provider_id),
         last_error = case when p_outcome = 'sent' then null
                           when p_outcome = 'not_configured' then 'not_configured'
                           else left(coalesce(p_error, p_outcome), 500) end,
         next_attempt_at = case when p_outcome = 'retry'
                                then now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'])[least(o.attempts, 4)]
                                else o.next_attempt_at end,
         locked_until = null
   where o.id = p_id and o.status = 'sending' and p_outcome in ('sent', 'not_configured', 'failed', 'retry')
  returning o.status into v_status;
  return v_status;
end
$function$;

-- The dispatcher's heartbeat; also prunes finished rows older than 90 days, a batch at a time.
create or replace function public.notification_dispatch_heartbeat(p_configured jsonb, p_claimed integer, p_sent integer, p_failed integer)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'notification_dispatch_heartbeat is for the dispatcher only' using errcode = '42501';
  end if;
  -- "where id": PostgREST sessions load safeupdate, which refuses an UPDATE without WHERE.
  update admin.notification_dispatcher_state
     set last_run_at = now(), configured = coalesce(p_configured, '{}'::jsonb),
         last_claimed = coalesce(p_claimed, 0), last_sent = coalesce(p_sent, 0), last_failed = coalesce(p_failed, 0)
   where id;
  delete from admin.notification_outbox o
   where o.id in (select x.id from admin.notification_outbox x
                   where x.status in ('sent', 'skipped', 'failed') and x.created_at < now() - interval '90 days'
                   limit 1000);
end
$function$;

-- ── 7. The first message: a plan invoice, by email ──────────────────────────────────
create or replace function admin.subscription_invoice_notify()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_total bigint := coalesce(new.total_paise, (new.amount::bigint + coalesce(new.gst_amount, 0)) * 100);
begin
  if new.document_type = 'demo' or new.status <> 'paid' then
    return new;
  end if;
  begin
    perform public.notify_deliver(new.vendor_id, 'invoice_issued', jsonb_build_object(
      'name', coalesce(nullif(new.recipient ->> 'name', ''), 'there'),
      'invoice_id', new.id,
      'invoice_number', coalesce(new.invoice_number, left(new.id::text, 8)),
      'document_label', case new.document_type
                          when 'tax_invoice' then 'tax invoice'
                          when 'receipt' then 'payment receipt'
                          when 'test' then 'test document'
                          else 'invoice' end,
      'note', case when new.document_type = 'test' then 'It was a Razorpay test-mode payment: no money was taken.' else '' end,
      'total', E'₹' || btrim(to_char(v_total / 100.0, 'FM99,99,99,99,990.00')),
      'plan_name', coalesce((select p.name from public.subscription_plans p where p.id = new.plan_id), new.plan_id, 'Cosora'),
      'period', coalesce(to_char(new.billing_period_start at time zone 'Asia/Kolkata', 'FMDD Mon YYYY') || ' to '
                         || to_char(new.billing_period_end at time zone 'Asia/Kolkata', 'FMDD Mon YYYY'), '')),
      'invoice_issued:' || new.id, array['email']);
  exception when others then
    -- A message must never cost the invoice: the fulfilment carries on without it.
    raise warning 'invoice_issued not queued for %: %', new.id, sqlerrm;
  end;
  return new;
end
$function$;
revoke all on function admin.subscription_invoice_notify() from public, anon, authenticated;
create trigger trg_subscription_invoices_notify
  after insert on public.subscription_invoices
  for each row execute function admin.subscription_invoice_notify();

-- ── 8. The person's own side: consent and where they are reached ────────────────────
create or replace function public.set_contact_consent(p_channel text, p_opted_in boolean, p_source text default 'vendor_settings')
returns void
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('whatsapp', 'sms') then
    raise exception 'unknown channel %', p_channel using errcode = '22023';
  end if;
  if p_opted_in is null or p_source is null or p_source not in ('vendor_settings', 'onboarding') then
    raise exception 'say yes or no, from settings or onboarding' using errcode = '22023';
  end if;
  insert into public.contact_consent (profile_id, channel, opted_in, changed_at, source)
  values (v_me, p_channel, p_opted_in, now(), p_source)
  on conflict (profile_id, channel) do update
    set opted_in = excluded.opted_in, changed_at = excluded.changed_at, source = excluded.source
    where public.contact_consent.opted_in is distinct from excluded.opted_in;
  -- Only a real change of mind is logged (pressing "on" twice is one opt-in).
  if found then
    insert into admin.contact_consent_log (profile_id, channel, opted_in, source)
    values (v_me, p_channel, p_opted_in, p_source);
  end if;
end
$function$;

create or replace function public.my_contact_channels()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'delivery_on', public.feature_on('notification_delivery'),
    'email', admin.mask_address(admin.contact_address(v_me, 'email'), 'email'),
    'whatsapp', admin.mask_address(admin.contact_address(v_me, 'whatsapp'), 'whatsapp'),
    'sms', admin.mask_address(admin.contact_address(v_me, 'sms'), 'sms'),
    'consent', jsonb_build_object(
      'whatsapp', coalesce((select c.opted_in from public.contact_consent c where c.profile_id = v_me and c.channel = 'whatsapp'), false),
      'sms', coalesce((select c.opted_in from public.contact_consent c where c.profile_id = v_me and c.channel = 'sms'), false)));
end
$function$;

-- ── 9. Cosora-Admin: System Health ──────────────────────────────────────────────────
create or replace function public.admin_notification_health()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'), false) then
    raise exception 'not authorized: System Health is for super admins and vendor ops' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dispatcher', (select jsonb_build_object('last_run_at', s.last_run_at, 'configured', s.configured, 'last_claimed', s.last_claimed,
                                             'last_sent', s.last_sent, 'last_failed', s.last_failed)
                     from admin.notification_dispatcher_state s),
    'channels', (select coalesce(jsonb_object_agg(ch.channel, jsonb_build_object(
        'due', (select count(*) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'queued' and o.next_attempt_at <= now()),
        'waiting', (select count(*) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'queued' and o.next_attempt_at > now()),
        'sending', (select count(*) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'sending'),
        'sent_24h', (select count(*) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'sent' and o.sent_at > now() - interval '24 hours'),
        'failed_24h', (select count(*) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'failed' and o.created_at > now() - interval '24 hours'),
        'skipped_24h', (select count(*) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'skipped' and o.created_at > now() - interval '24 hours'),
        'oldest_due_at', (select min(o.next_attempt_at) from admin.notification_outbox o where o.channel = ch.channel and o.status = 'queued' and o.next_attempt_at <= now()))), '{}'::jsonb)
      from (values ('email'), ('whatsapp'), ('sms')) ch(channel)),
    'recent_failures', (select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb) from (
        select o.id, o.channel, o.template_key, admin.mask_address(o.to_address, o.channel) as to_masked, o.attempts, o.status,
               o.last_error, o.created_at
          from admin.notification_outbox o
         where o.status in ('failed', 'skipped') or (o.status = 'queued' and o.attempts > 0)
         order by o.created_at desc limit 20) f));
end
$function$;

-- A test to the super admin's own address. It skips the switch and consent (the person
-- asked for it), and is limited to 5 an hour.
create or replace function public.admin_notification_test(p_channel text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_me   uuid := auth.uid();
  v_addr text;
  v_tid  uuid;
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
    raise exception 'not authorized: a test send is for super admins' using errcode = '42501';
  end if;
  if p_channel is null or p_channel not in ('email', 'whatsapp', 'sms') then
    raise exception 'unknown channel %', p_channel using errcode = '22023';
  end if;
  if (select count(*) from admin.notification_outbox o
       where o.profile_id = v_me and o.template_key = 'delivery_test' and o.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('queued', false, 'reason', 'rate_limited');
  end if;
  v_addr := admin.contact_address(v_me, p_channel);
  if v_addr is null then
    return jsonb_build_object('queued', false, 'reason', 'no_address');
  end if;
  select t.id into v_tid from admin.notification_templates t
   where t.key = 'delivery_test' and t.channel = p_channel and t.active order by t.version desc limit 1;
  insert into admin.notification_outbox (profile_id, template_id, template_key, channel, to_address, payload)
  values (v_me, v_tid, 'delivery_test', p_channel, v_addr,
          jsonb_build_object('queued_at', to_char(now() at time zone 'Asia/Kolkata', 'FMDD Mon YYYY, HH24:MI "IST"')));
  return jsonb_build_object('queued', true, 'to', admin.mask_address(v_addr, p_channel));
end
$function$;

-- ── 10. Grants ──────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.notify_deliver(uuid,text,jsonb,text,text[])',
    'public.notification_claim(integer)',
    'public.notification_mark(uuid,text,text,text)',
    'public.notification_dispatch_heartbeat(jsonb,integer,integer,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.set_contact_consent(text,boolean,text)', 'public.my_contact_channels()',
    'public.admin_notification_health()', 'public.admin_notification_test(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ── 11. Self-check ──────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.notify_deliver(uuid,text,jsonb,text,text[])', 'public.notification_claim(integer)',
    'public.notification_mark(uuid,text,text,text)', 'public.notification_dispatch_heartbeat(jsonb,integer,integer,integer)',
    'admin.contact_address(uuid,text)', 'admin.mask_address(text,text)', 'admin.phone_e164_digits(text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.contact_consent', 'INSERT')
     or has_table_privilege('authenticated', 'public.contact_consent', 'UPDATE') then
    raise exception 'consent is written only through set_contact_consent()';
  end if;
  if admin.phone_e164_digits('98765 43210') <> '919876543210' or admin.phone_e164_digits('+44 7911 123456') <> '447911123456'
     or admin.phone_e164_digits('12345') is not null then
    raise exception 'phone normalisation is wrong';
  end if;
  if (select enabled from public.feature_flags where key = 'notification_delivery') then
    raise exception 'notification_delivery must start switched off';
  end if;
end
$check$;
