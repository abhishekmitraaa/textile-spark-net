-- Help & Support, phase P2a + P2d (documentation/help-feature-plan.md), 2026-09-30.
--
-- The data layer behind Help. Every request a buyer or vendor makes (a chat, a
-- callback request, a fraud report, app feedback) is one support_tickets row, answered
-- from Cosora-Admin by the support role (Andy's decisions D-01 to D-03).
--
--   support_categories     the topics a request can be about, labels in en/hi/gu
--   support_hours          opening hours per weekday, IST (seeded Mon-Fri 10:00-19:00, D-18)
--   support_holidays       closed days
--   support_settings       one row: rollout (off | staff | all, D-14), test accounts, the
--                          phone number and email Help shows
--   support_tickets        the case record. Only columns the requester may see.
--   support_ticket_staff   what only staff see: the assignee (users see "Cosora Support",
--                          D-06), the context the server gathered, outcomes
--   support_messages       the thread, append-only. Internal notes never reach the requester.
--   support_attachments    photo / PDF / audio (D-09) in the private support-attachments bucket
--   support_callbacks      callback phone and window. RPC only.
--   support_fraud_details  who and what a fraud report is about. RPC only.
--   support_events         every status change, by requester, staff or the system, append-only
--   help_guides            the Quick Guides, admin-editable, en/hi/gu
--
-- Nothing is visible to users until support_settings.rollout leaves 'off'.
-- Writes happen only in SECURITY DEFINER functions (the next two migrations). Clients
-- get SELECT, narrowed by RLS, and nothing else.

-- ── 1. Configuration ─────────────────────────────────────────────────────────
create table if not exists public.support_categories (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  audience   text not null check (audience in ('buyer', 'vendor', 'both')),
  channels   text[] not null
             check (cardinality(channels) > 0
                    and channels <@ array['chat', 'callback', 'fraud_report', 'feedback']::text[]),
  label      jsonb not null check (jsonb_typeof(label) = 'object' and coalesce(label ->> 'en', '') <> ''),
  restricted boolean not null default false,
  position   int not null default 0,
  active     boolean not null default true
);

insert into public.support_categories (code, audience, channels, label, restricted, position, active) values
  ('buyer_account',      'buyer',  array['chat', 'callback'], '{"en":"Account and sign-in","hi":"खाता और साइन-इन","gu":"એકાઉન્ટ અને સાઇન-ઇન"}', false, 10, true),
  ('buyer_requirements', 'buyer',  array['chat', 'callback'], '{"en":"Requirements and quotes","hi":"आवश्यकताएँ और कोटेशन","gu":"જરૂરિયાતો અને ક્વોટેશન"}', false, 20, true),
  ('buyer_vendor_issue', 'buyer',  array['chat', 'callback'], '{"en":"A problem with a vendor","hi":"किसी विक्रेता से जुड़ी समस्या","gu":"વિક્રેતા સાથેની સમસ્યા"}', false, 30, true),
  ('buyer_chat',         'buyer',  array['chat', 'callback'], '{"en":"Chats and calls","hi":"चैट और कॉल","gu":"ચેટ અને કૉલ"}', false, 40, true),
  ('vendor_kyc',         'vendor', array['chat', 'callback'], '{"en":"Verification and documents","hi":"सत्यापन और दस्तावेज़","gu":"ચકાસણી અને દસ્તાવેજો"}', false, 110, true),
  ('vendor_leads',       'vendor', array['chat', 'callback'], '{"en":"Leads and quotes","hi":"लीड और कोटेशन","gu":"લીડ અને ક્વોટેશન"}', false, 120, true),
  ('vendor_products',    'vendor', array['chat', 'callback'], '{"en":"Products and Video Closeups","hi":"उत्पाद और वीडियो क्लोज़अप","gu":"ઉત્પાદનો અને વિડિયો ક્લોઝઅપ"}', false, 130, true),
  ('vendor_ads',         'vendor', array['chat', 'callback'], '{"en":"Advertising","hi":"विज्ञापन","gu":"જાહેરાત"}', false, 140, true),
  -- Off until the manual refund process is written (D-11, gate G1). A super admin
  -- switches it on in Support settings.
  ('vendor_billing',     'vendor', array['chat', 'callback'], '{"en":"Subscription and billing","hi":"सदस्यता और बिलिंग","gu":"સબ્સ્ક્રિપ્શન અને બિલિંગ"}', false, 150, false),
  ('vendor_account',     'vendor', array['chat', 'callback'], '{"en":"Account status and suspension","hi":"खाते की स्थिति और निलंबन","gu":"એકાઉન્ટની સ્થિતિ અને સસ્પેન્શન"}', false, 160, true),
  ('privacy_request',    'both',   array['chat', 'callback'], '{"en":"My data and account deletion","hi":"मेरा डेटा और खाता हटाना","gu":"મારો ડેટા અને એકાઉન્ટ કાઢી નાખવું"}', false, 210, true),
  ('technical',          'both',   array['chat', 'callback'], '{"en":"Something isn''t working","hi":"कुछ काम नहीं कर रहा","gu":"કંઈક કામ કરતું નથી"}', false, 220, true),
  ('other',              'both',   array['chat', 'callback'], '{"en":"Something else","hi":"कुछ और","gu":"બીજું કંઈક"}', false, 230, true),
  ('trust_fraud',        'both',   array['fraud_report'],     '{"en":"Fraud report","hi":"धोखाधड़ी की रिपोर्ट","gu":"છેતરપિંડીનો રિપોર્ટ"}', true, 300, true),
  ('feedback_bug',       'both',   array['feedback'],         '{"en":"Report a bug","hi":"गड़बड़ी की रिपोर्ट करें","gu":"ખામીની જાણ કરો"}', false, 400, true),
  ('feedback_idea',      'both',   array['feedback'],         '{"en":"Suggest an idea","hi":"सुझाव दें","gu":"સૂચન આપો"}', false, 410, true)
on conflict (code) do nothing;

-- 0 = Sunday, as extract(dow ...). Times are IST.
create table if not exists public.support_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  is_open    boolean not null,
  open_time  time,
  close_time time,
  check (not is_open or (open_time is not null and close_time is not null and open_time < close_time))
);
insert into public.support_hours (weekday, is_open, open_time, close_time) values
  (0, false, null, null),
  (1, true, '10:00', '19:00'), (2, true, '10:00', '19:00'), (3, true, '10:00', '19:00'),
  (4, true, '10:00', '19:00'), (5, true, '10:00', '19:00'),
  (6, false, null, null)
on conflict (weekday) do nothing;

create table if not exists public.support_holidays (
  day        date primary key,
  label      text not null check (char_length(btrim(label)) between 1 and 80),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.support_settings (
  singleton        boolean primary key default true check (singleton),
  -- off: nobody. staff: active admins plus test_profile_ids. all: every signed-in user.
  rollout          text not null default 'off' check (rollout in ('off', 'staff', 'all')),
  test_profile_ids uuid[] not null default '{}',
  support_phone    text not null default '+918815578226' check (support_phone ~ '^\+[0-9]{8,15}$'),
  support_email    text not null default 'hello@cosora.in' check (support_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);
insert into public.support_settings (singleton) values (true) on conflict (singleton) do nothing;

-- ── 2. The case record ───────────────────────────────────────────────────────
create sequence if not exists public.support_ticket_no_seq;

create table if not exists public.support_tickets (
  id                     uuid primary key default gen_random_uuid(),
  ticket_no              text not null unique
                         default ('CS-' || lpad(nextval('public.support_ticket_no_seq')::text, 6, '0')),
  requester_id           uuid references public.profiles(id) on delete set null,
  requester_side         text not null check (requester_side in ('buyer', 'vendor')),
  channel                text not null check (channel in ('chat', 'callback', 'fraud_report', 'feedback')),
  category               text not null references public.support_categories(code),
  subject                text not null check (char_length(subject) between 1 and 140),
  status                 text not null default 'new' check (status in ('new', 'open', 'resolved', 'closed')),
  language               text not null default 'en' check (language in ('en', 'hi', 'gu')),
  entity_type            text check (entity_type in ('conversation', 'rfq', 'quote', 'product', 'video', 'vendor',
                                                     'ad', 'invoice', 'kyc', 'certificate_order', 'review', 'account')),
  entity_id              uuid,
  restricted             boolean not null default false,
  is_test                boolean not null default false,
  created_at             timestamptz not null default now(),
  last_message_at        timestamptz not null default now(),
  first_staff_reply_at   timestamptz,
  requester_last_read_at timestamptz,
  resolved_at            timestamptz,
  closed_at              timestamptz,
  reopen_count           int not null default 0 check (reopen_count >= 0),
  check ((entity_type is null) = (entity_id is null))
);
create index if not exists support_tickets_requester_idx on public.support_tickets (requester_id, created_at desc);
create index if not exists support_tickets_queue_idx on public.support_tickets (status, last_message_at);
create index if not exists support_tickets_channel_idx on public.support_tickets (channel, status);

create table if not exists public.support_ticket_staff (
  ticket_id     uuid primary key references public.support_tickets(id) on delete cascade,
  assignee_id   uuid references public.profiles(id) on delete set null,
  assigned_at   timestamptz,
  -- Facts the server gathered when the request was opened (account status, plan, KYC,
  -- what the linked item is). Never shown to the requester.
  context       jsonb not null default '{}'::jsonb,
  fraud_outcome text check (fraud_outcome in ('no_action', 'warned', 'suspended', 'escalated_legal')),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);
create index if not exists support_ticket_staff_assignee_idx on public.support_ticket_staff (assignee_id);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  author_kind text not null check (author_kind in ('requester', 'staff', 'system')),
  visibility  text not null default 'public' check (visibility in ('public', 'internal')),
  kind        text not null default 'text' check (kind in ('text', 'attachment', 'event')),
  body        text check (body is null or char_length(body) <= 4000),
  event       text check (event is null or event ~ '^[a-z][a-z_]{1,39}$'),
  meta        jsonb not null default '{}'::jsonb,
  -- clock_timestamp(), not now(): one request can add several rows in one transaction
  -- (the message, then the automatic reply), and the thread is ordered by this.
  created_at  timestamptz not null default clock_timestamp(),
  check (author_kind <> 'requester' or visibility = 'public'),
  check (kind <> 'event' or event is not null),
  check (kind <> 'text' or (body is not null and btrim(body) <> ''))
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create table if not exists public.support_attachments (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references public.support_tickets(id) on delete cascade,
  message_id         uuid references public.support_messages(id) on delete cascade,
  uploader_id        uuid references public.profiles(id) on delete set null,
  uploader_kind      text not null check (uploader_kind in ('requester', 'staff')),
  kind               text not null check (kind in ('image', 'pdf', 'audio')),
  mime               text not null check (char_length(mime) <= 100),
  bytes              int not null check (bytes > 0 and bytes <= 10485760),
  duration_ms        int check (duration_ms is null or duration_ms between 0 and 600000),
  storage_path       text not null unique,
  status             text not null default 'pending' check (status in ('pending', 'clean', 'rejected')),
  -- False for fraud evidence: the reporter sees "N files received", never the files.
  requester_can_view boolean not null default true,
  checked_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists support_attachments_ticket_idx on public.support_attachments (ticket_id);
create index if not exists support_attachments_message_idx on public.support_attachments (message_id);

create table if not exists public.support_callbacks (
  ticket_id       uuid primary key references public.support_tickets(id) on delete cascade,
  phone           text not null check (phone ~ '^\+?[0-9]{8,15}$'),
  preferred_date  date not null,
  window_start    time not null,
  window_end      time not null check (window_end > window_start),
  attempts        int not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  outcome         text not null default 'pending'
                  check (outcome in ('pending', 'completed', 'no_answer', 'wrong_number', 'cancelled')),
  created_at      timestamptz not null default now()
);

create table if not exists public.support_fraud_details (
  ticket_id            uuid primary key references public.support_tickets(id) on delete cascade,
  reported_name        text check (reported_name is null or char_length(reported_name) <= 120),
  reported_phone       text check (reported_phone is null or reported_phone ~ '^\+?[0-9]{6,15}$'),
  reported_url         text check (reported_url is null or char_length(reported_url) <= 500),
  reported_entity_type text check (reported_entity_type in ('vendor', 'buyer', 'product', 'ad', 'conversation')),
  reported_entity_id   uuid,
  amount_inr           numeric(14, 2) check (amount_inr is null or amount_inr >= 0),
  incident_date        date,
  city                 text check (city is null or char_length(city) <= 80),
  created_at           timestamptz not null default now(),
  check ((reported_entity_type is null) = (reported_entity_id is null))
);

create table if not exists public.support_events (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  actor_id    uuid,
  actor_kind  text not null check (actor_kind in ('requester', 'staff', 'system')),
  event       text not null check (event ~ '^[a-z][a-z_]{1,39}$'),
  from_status text,
  to_status   text,
  detail      jsonb not null default '{}'::jsonb,
  at          timestamptz not null default clock_timestamp()
);
create index if not exists support_events_ticket_idx on public.support_events (ticket_id, at);

create table if not exists public.help_guides (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  audience    text not null check (audience in ('buyer', 'vendor', 'both')),
  title       jsonb not null check (jsonb_typeof(title) = 'object' and coalesce(title ->> 'en', '') <> ''),
  body        jsonb not null check (jsonb_typeof(body) = 'object' and coalesce(body ->> 'en', '') <> ''),
  position    int not null default 0,
  active      boolean not null default false,
  verified_at timestamptz,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ── 3. Append-only thread and timeline ───────────────────────────────────────
-- A thread is the record of what was said. Foreign-key actions (a ticket removed, an
-- author's profile removed) run one trigger level down and pass. The account-deletion
-- scrub (plan P6, D-16) sets cosora.support_scrub for its own transaction.
create or replace function admin.support_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if pg_trigger_depth() > 1 or coalesce(current_setting('cosora.support_scrub', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end
$function$;
revoke all on function admin.support_append_only() from public, anon, authenticated;

drop trigger if exists trg_support_messages_append_only on public.support_messages;
create trigger trg_support_messages_append_only before update or delete on public.support_messages
  for each row execute function admin.support_append_only();
drop trigger if exists trg_support_events_append_only on public.support_events;
create trigger trg_support_events_append_only before update or delete on public.support_events
  for each row execute function admin.support_append_only();

-- ── 4. Access ────────────────────────────────────────────────────────────────
alter table public.support_categories    enable row level security;
alter table public.support_hours         enable row level security;
alter table public.support_holidays      enable row level security;
alter table public.support_settings      enable row level security;
alter table public.support_tickets       enable row level security;
alter table public.support_ticket_staff  enable row level security;
alter table public.support_messages      enable row level security;
alter table public.support_attachments   enable row level security;
alter table public.support_callbacks     enable row level security;
alter table public.support_fraud_details enable row level security;
alter table public.support_events        enable row level security;
alter table public.help_guides           enable row level security;

-- New public tables inherit a default ACL that grants clients every privilege. Take it
-- all back, then grant only the reads below.
revoke all on table
  public.support_categories, public.support_hours, public.support_holidays, public.support_settings,
  public.support_tickets, public.support_ticket_staff, public.support_messages, public.support_attachments,
  public.support_callbacks, public.support_fraud_details, public.support_events, public.help_guides
  from public, anon, authenticated;
revoke all on sequence public.support_ticket_no_seq from public, anon, authenticated;
revoke all on sequence public.support_events_id_seq from public, anon, authenticated;

-- Staff who read support: super_admin, support, manager (D-08). Written with
-- (select ...) so each policy evaluates the role once per query, not per row.
grant select on public.support_tickets, public.support_ticket_staff, public.support_events to authenticated;
-- Messages and attachments are also readable by the requester (their own ticket, public
-- rows only), so the columns that name a staff member are left out: author_id and
-- uploader_id resolve to a person through profiles.full_name, and requesters only ever
-- see "Cosora Support" (D-06). Realtime drops columns the subscriber can't select, so
-- the events carry no staff id either. Staff read both through the definer RPCs.
grant select (id, ticket_id, author_kind, visibility, kind, body, event, meta, created_at)
  on public.support_messages to authenticated;
grant select (id, ticket_id, message_id, uploader_kind, kind, mime, bytes, duration_ms, storage_path, status,
              requester_can_view, checked_at, created_at)
  on public.support_attachments to authenticated;
grant select (code, audience, channels, label, restricted, position, active)
  on public.support_categories to anon, authenticated;
grant select (id, slug, audience, title, body, position, active, verified_at, updated_at, created_at)
  on public.help_guides to anon, authenticated;

drop policy if exists support_categories_select_active on public.support_categories;
create policy support_categories_select_active on public.support_categories
  for select to anon, authenticated using (active);

drop policy if exists help_guides_select_active on public.help_guides;
create policy help_guides_select_active on public.help_guides
  for select to anon, authenticated using (active);

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (requester_id = (select auth.uid())
         or coalesce((select public.admin_role())::text in ('super_admin', 'support', 'manager'), false));

drop policy if exists support_ticket_staff_select on public.support_ticket_staff;
create policy support_ticket_staff_select on public.support_ticket_staff
  for select to authenticated
  using (coalesce((select public.admin_role())::text in ('super_admin', 'support', 'manager'), false));

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
  for select to authenticated
  using ((visibility = 'public'
          and exists (select 1 from public.support_tickets t
                       where t.id = support_messages.ticket_id and t.requester_id = (select auth.uid())))
         or coalesce((select public.admin_role())::text in ('super_admin', 'support', 'manager'), false));

drop policy if exists support_attachments_select on public.support_attachments;
create policy support_attachments_select on public.support_attachments
  for select to authenticated
  using ((requester_can_view and status = 'clean'
          and exists (select 1 from public.support_tickets t
                       where t.id = support_attachments.ticket_id and t.requester_id = (select auth.uid())))
         or coalesce((select public.admin_role())::text in ('super_admin', 'support', 'manager'), false));

drop policy if exists support_events_select on public.support_events;
create policy support_events_select on public.support_events
  for select to authenticated
  using (coalesce((select public.admin_role())::text in ('super_admin', 'support', 'manager'), false));
-- support_hours, support_holidays, support_settings, support_callbacks and
-- support_fraud_details have RLS on and no policy: they are read through RPCs only, so a
-- phone number can't be read without the logged reveal.

-- Gates used by the RPCs. Plain (invoker) helpers: only the definer RPCs call them.
create or replace function admin.support_can_read()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'support', 'manager']::public.admin_role_type[]), false);
$function$;
create or replace function admin.support_can_write()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[]), false);
$function$;
revoke all on function admin.support_can_read() from public, anon, authenticated;
revoke all on function admin.support_can_write() from public, anon, authenticated;

-- ── 5. Hours ─────────────────────────────────────────────────────────────────
create or replace function admin.support_is_open_at(p_at timestamptz)
returns boolean language sql stable set search_path = '' as $function$
  select exists (
           select 1 from public.support_hours h
            where h.weekday = extract(dow from (p_at at time zone 'Asia/Kolkata'))::int
              and h.is_open
              and (p_at at time zone 'Asia/Kolkata')::time >= h.open_time
              and (p_at at time zone 'Asia/Kolkata')::time <  h.close_time)
     and not exists (select 1 from public.support_holidays d
                      where d.day = (p_at at time zone 'Asia/Kolkata')::date);
$function$;

-- The next moment support is open, from p_at (p_at itself when open now). Null when
-- nothing opens in the next 60 days.
create or replace function admin.support_next_open_at(p_at timestamptz)
returns timestamptz language plpgsql stable set search_path = '' as $function$
declare
  v_local timestamp := p_at at time zone 'Asia/Kolkata';
  v_day   date;
  h       record;
  i       int;
begin
  if admin.support_is_open_at(p_at) then
    return p_at;
  end if;
  for i in 0..60 loop
    v_day := v_local::date + i;
    select * into h from public.support_hours s where s.weekday = extract(dow from v_day)::int;
    continue when not found;
    if h.is_open and not exists (select 1 from public.support_holidays d where d.day = v_day) then
      if i > 0 or v_local::time < h.open_time then
        return (v_day + h.open_time) at time zone 'Asia/Kolkata';
      end if;
    end if;
  end loop;
  return null;
end
$function$;

-- Who may use support right now. auth.uid() is the caller.
create or replace function admin.support_rollout_allows()
returns boolean language sql stable set search_path = '' as $function$
  select coalesce((select s.rollout = 'all'
                          or (s.rollout = 'staff'
                              and (public.is_admin() or auth.uid() = any (s.test_profile_ids)))
                     from public.support_settings s where s.singleton), false);
$function$;
revoke all on function admin.support_is_open_at(timestamptz) from public, anon, authenticated;
revoke all on function admin.support_next_open_at(timestamptz) from public, anon, authenticated;
revoke all on function admin.support_rollout_allows() from public, anon, authenticated;

-- ── 6. Notifications ─────────────────────────────────────────────────────────
-- notify() keeps its signature (a changed signature would add an overload). This
-- wrapper only narrows the kinds. The bell links these kinds to /help/requests.
create or replace function admin.support_notify(p_profile_id uuid, p_kind text, p_title text, p_body text)
returns void language plpgsql volatile set search_path = '' as $function$
begin
  if p_kind not in ('support_reply', 'support_status', 'support_callback', 'support_receipt') then
    raise exception 'unknown support notification kind %', p_kind using errcode = '22023';
  end if;
  perform public.notify(p_profile_id, p_kind, p_title, p_body, null::uuid);
end
$function$;
revoke all on function admin.support_notify(uuid, text, text, text) from public, anon, authenticated;

-- ── 7. Admin Log ─────────────────────────────────────────────────────────────
-- A phone-number reveal is a read, not a row change, so the audit trigger can't see
-- it. admin_support_reveal_contact() records it as its own action (D-08).
alter table admin.audit_log drop constraint if exists audit_log_action_check;
alter table admin.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'delete', 'sign_in', 'sign_out', 'invite', 'refund', 'reveal_contact'));

-- Admin changes to tickets and support configuration go to the Admin Log.
--   * Without an owner column: audit_row_change(<owner>) writes own_row as NULL, which
--     admin.audit_log refuses, whenever that column is NULL (a ticket whose requester was
--     removed, a holiday no admin created). Found in the P2e rehearsal, 2026-09-30.
--   * NOT support_ticket_staff: it has no id column, so its log rows couldn't name the
--     ticket. support_events records every assignment and outcome, with the ticket.
--   * NOT support_messages: the trigger copies whole rows, so every message body would
--     land in the log. The thread itself is the record of what was said.
drop trigger if exists trg_admin_audit on public.support_tickets;
create trigger trg_admin_audit after insert or update or delete on public.support_tickets
  for each row execute function admin.audit_row_change();
drop trigger if exists trg_admin_audit on public.support_categories;
create trigger trg_admin_audit after insert or update or delete on public.support_categories
  for each row execute function admin.audit_row_change();
drop trigger if exists trg_admin_audit on public.support_hours;
create trigger trg_admin_audit after insert or update or delete on public.support_hours
  for each row execute function admin.audit_row_change();
drop trigger if exists trg_admin_audit on public.support_holidays;
create trigger trg_admin_audit after insert or update or delete on public.support_holidays
  for each row execute function admin.audit_row_change();
drop trigger if exists trg_admin_audit on public.support_settings;
create trigger trg_admin_audit after insert or update or delete on public.support_settings
  for each row execute function admin.audit_row_change();
drop trigger if exists trg_admin_audit on public.help_guides;
create trigger trg_admin_audit after insert or update or delete on public.help_guides
  for each row execute function admin.audit_row_change();

-- ── 8. Live updates ──────────────────────────────────────────────────────────
-- Postgres Changes with RLS: a requester receives their own public messages, staff
-- receive everything. Clients treat an event as "refetch", never as data.
do $pub$
declare
  t text;
begin
  foreach t in array array['support_tickets', 'support_ticket_staff', 'support_messages'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$pub$;

-- ── 9. Attachments bucket ────────────────────────────────────────────────────
-- Private. Path {ticket_id}/{attachment_id}.{ext}. A client may upload only to a path
-- support_prepare_upload() reserved for it in the last hour, and may read only files
-- the signature check marked clean: its own (unless it is fraud evidence), or any, for
-- support staff. No client update or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf',
              'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.support_attachment_upload_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf|webm|ogg|m4a|mp3|aac|wav)$'
     and exists (select 1 from public.support_attachments a
                  where a.storage_path = p_name
                    and a.uploader_id = auth.uid()
                    and a.status = 'pending'
                    and a.created_at > now() - interval '1 hour');
$function$;

create or replace function public.support_attachment_read_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (select 1 from public.support_attachments a
                   join public.support_tickets t on t.id = a.ticket_id
                  where a.storage_path = p_name
                    and a.status = 'clean'
                    and ((t.requester_id = auth.uid() and a.requester_can_view)
                         or coalesce(public.admin_role()::text in ('super_admin', 'support', 'manager'), false)));
$function$;
revoke all on function public.support_attachment_upload_allowed(text) from public, anon, authenticated;
revoke all on function public.support_attachment_read_allowed(text) from public, anon, authenticated;
grant execute on function public.support_attachment_upload_allowed(text) to authenticated;
grant execute on function public.support_attachment_read_allowed(text) to authenticated;

drop policy if exists support_attachments_insert on storage.objects;
create policy support_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments' and (select public.support_attachment_upload_allowed(name)));
drop policy if exists support_attachments_read on storage.objects;
create policy support_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'support-attachments' and (select public.support_attachment_read_allowed(name)));

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  t text;
  f text;
begin
  foreach t in array array[
    'public.support_categories', 'public.support_hours', 'public.support_holidays', 'public.support_settings',
    'public.support_tickets', 'public.support_ticket_staff', 'public.support_messages', 'public.support_attachments',
    'public.support_callbacks', 'public.support_fraud_details', 'public.support_events', 'public.help_guides'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = t::regclass) then
      raise exception 'self-check: RLS is off on %', t;
    end if;
    if has_table_privilege('anon', t, 'INSERT') or has_table_privilege('anon', t, 'UPDATE')
       or has_table_privilege('anon', t, 'DELETE') or has_table_privilege('authenticated', t, 'INSERT')
       or has_table_privilege('authenticated', t, 'UPDATE') or has_table_privilege('authenticated', t, 'DELETE')
       or has_table_privilege('authenticated', t, 'TRUNCATE') then
      raise exception 'self-check: a client role can write %', t;
    end if;
  end loop;
  foreach t in array array['public.support_hours', 'public.support_holidays', 'public.support_settings',
                           'public.support_callbacks', 'public.support_fraud_details'] loop
    if has_table_privilege('authenticated', t, 'SELECT') or has_table_privilege('anon', t, 'SELECT') then
      raise exception 'self-check: a client role can read %', t;
    end if;
  end loop;
  foreach t in array array['public.support_tickets', 'public.support_ticket_staff', 'public.support_messages',
                           'public.support_attachments', 'public.support_events'] loop
    if has_table_privilege('anon', t, 'SELECT') then
      raise exception 'self-check: anon can read %', t;
    end if;
  end loop;
  if has_column_privilege('anon', 'public.help_guides', 'updated_by', 'SELECT') then
    raise exception 'self-check: anon can read help_guides.updated_by';
  end if;
  -- D-06: nothing a requester can select names the staff member who answered.
  if has_column_privilege('authenticated', 'public.support_messages', 'author_id', 'SELECT')
     or has_column_privilege('authenticated', 'public.support_attachments', 'uploader_id', 'SELECT') then
    raise exception 'self-check: clients can read a staff member''s id on messages or attachments';
  end if;
  if has_sequence_privilege('authenticated', 'public.support_ticket_no_seq', 'USAGE') then
    raise exception 'self-check: clients can use the ticket number sequence';
  end if;
  foreach f in array array['admin.support_can_read()', 'admin.support_can_write()', 'admin.support_is_open_at(timestamptz)',
                           'admin.support_next_open_at(timestamptz)', 'admin.support_rollout_allows()',
                           'admin.support_notify(uuid, text, text, text)', 'admin.support_append_only()'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: a client role can execute %', f;
    end if;
  end loop;
  foreach f in array array['public.support_attachment_upload_allowed(text)', 'public.support_attachment_read_allowed(text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: grants or definer on % are wrong', f;
    end if;
  end loop;
  if exists (select 1 from pg_trigger g where g.tgname = 'trg_admin_audit'
              and g.tgrelid in ('public.support_messages'::regclass, 'public.support_ticket_staff'::regclass)) then
    raise exception 'self-check: no audit trigger on support_messages (bodies) or support_ticket_staff (no id)';
  end if;
  if exists (select 1 from pg_trigger g where g.tgname = 'trg_admin_audit' and g.tgnargs > 0
              and (select c.relname from pg_class c where c.oid = g.tgrelid) in
                  ('support_tickets', 'support_categories', 'support_hours', 'support_holidays',
                   'support_settings', 'help_guides')) then
    raise exception 'self-check: support audit triggers take no owner column';
  end if;
  foreach t in array array['public.support_tickets', 'public.support_categories', 'public.support_hours',
                           'public.support_holidays', 'public.support_settings', 'public.help_guides'] loop
    if not exists (select 1 from pg_trigger g where g.tgrelid = t::regclass and g.tgname = 'trg_admin_audit') then
      raise exception 'self-check: no audit trigger on %', t;
    end if;
  end loop;
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('support_tickets', 'support_ticket_staff', 'support_messages')) <> 3 then
    raise exception 'self-check: the support tables are not all in supabase_realtime';
  end if;
  if (select b.public from storage.buckets b where b.id = 'support-attachments') is distinct from false then
    raise exception 'self-check: support-attachments must exist and be private';
  end if;
  if (select s.rollout from public.support_settings s) is distinct from 'off' then
    raise exception 'self-check: support must start switched off';
  end if;
  if (select count(*) from public.support_hours h where h.is_open) <> 5 then
    raise exception 'self-check: expected Monday to Friday open';
  end if;
  if (select count(*) from public.support_categories) < 16 then
    raise exception 'self-check: categories were not seeded';
  end if;
end
$check$;
