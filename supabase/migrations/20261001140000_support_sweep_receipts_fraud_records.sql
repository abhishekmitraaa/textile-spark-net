-- Help & Support P6 (documentation/help-feature-plan.md), 2026-10-01.
--
-- 1. admin.fraud_findings: the lasting record of confirmed fraud (D-16, revised by Andy
--    on 2026-10-01). A fraud report is kept for a year. When a reviewer decides it was
--    fraud (outcome warned, suspended or escalated_legal), a record of who it was, what
--    they did (the reviewer's note) and what happened to their account is written at
--    once, and it outlives the report. Changing the outcome to no_action withdraws it.
-- 2. The support sweep's SQL (D-21). The sweep itself is the `support-sweep` edge
--    function, because files are deleted through the Storage API. Nothing schedules it
--    here: the schedule waits for Mitra's approval (scripts/support-sweep-schedule.sql).
--      support_sweep_run()    every run: closes requests resolved 7+ days ago, flags
--                             callback windows that passed with no call logged, and
--                             lists what's due for deletion with its files;
--      support_sweep_purge()  deletes those requests, once the function has deleted
--                             their files, and logs the ticket number.
--    Due for deletion:
--      * a fraud report a year after it was filed, once it's been decided or closed;
--      * every other request of an account that has been deleted (D-16). Fraud reports
--        that account filed follow the one-year rule.
-- 3. Email receipts (D-20, D-22): support_receipt_target() and support_receipt_record(),
--    for the `support-receipt` edge function. Feedback and fraud reports only; the email
--    repeats nothing the person wrote.
--
-- Everything here is service_role only, except admin_fraud_findings() (super_admin,
-- support, manager: admin.support_can_read()).

-- ── 1. Confirmed fraud: the lasting record ───────────────────────────────────
create table if not exists admin.fraud_findings (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid unique,      -- no foreign key: the record outlives the report
  ticket_no          text not null,
  subject_profile_id uuid,             -- the account, when the report named one Cosora knows
  subject_kind       text check (subject_kind in ('vendor', 'buyer')),
  subject_name       text,             -- the store or profile name then, or the name as reported
  what_happened      text,             -- the reviewer's note when they decided
  amount_inr         numeric,
  incident_date      date,
  outcome            text not null check (outcome in ('warned', 'suspended', 'escalated_legal')),
  account_status     text,             -- the subject account's status when it was decided
  decided_by         uuid,
  decided_at         timestamptz not null,
  withdrawn_at       timestamptz,      -- the outcome was later changed to no_action
  report_purged_at   timestamptz,      -- the report itself was deleted (one year)
  created_at         timestamptz not null default now()
);
create index if not exists fraud_findings_subject_idx on admin.fraud_findings (subject_profile_id);
alter table admin.fraud_findings enable row level security;
revoke all on admin.fraud_findings from public, anon, authenticated;
comment on table admin.fraud_findings is
  'Confirmed fraud (D-16, 2026-10-01): who, what they did, the outcome and the account status. Written when a reviewer decides, kept after the report is deleted a year on. Read through admin_fraud_findings().';

create or replace function admin.fraud_finding_on_outcome()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  d       public.support_fraud_details;
  t       public.support_tickets;
  v_id    uuid;
  v_kind  text;
  v_name  text;
  v_note  text;
begin
  if new.fraud_outcome in ('warned', 'suspended', 'escalated_legal') then
    select * into t from public.support_tickets where id = new.ticket_id;
    select * into d from public.support_fraud_details where ticket_id = new.ticket_id;

    -- Who it was about, when the report named something Cosora knows.
    if d.reported_entity_type = 'vendor' then
      v_id := d.reported_entity_id; v_kind := 'vendor';
    elsif d.reported_entity_type = 'buyer' then
      v_id := d.reported_entity_id; v_kind := 'buyer';
    elsif d.reported_entity_type = 'product' then
      select p.vendor_id into v_id from public.products p where p.id = d.reported_entity_id;
      v_kind := case when v_id is null then null else 'vendor' end;
    elsif d.reported_entity_type = 'ad' then
      select a.vendor_id into v_id from public.advertisements a where a.id = d.reported_entity_id;
      v_kind := case when v_id is null then null else 'vendor' end;
    end if;
    if v_kind = 'vendor' then
      select nullif(btrim(vp.brand_name), '') into v_name from public.vendor_profiles vp where vp.id = v_id;
    elsif v_kind = 'buyer' then
      select nullif(btrim(pr.full_name), '') into v_name from public.profiles pr where pr.id = v_id;
    end if;
    v_name := coalesce(v_name, d.reported_name);

    -- What they did: the reviewer's note, written just before the outcome.
    select m.body into v_note from public.support_messages m
     where m.ticket_id = new.ticket_id and m.author_kind = 'staff' and m.visibility = 'internal' and m.kind = 'text'
     order by m.created_at desc limit 1;

    insert into admin.fraud_findings as f
      (ticket_id, ticket_no, subject_profile_id, subject_kind, subject_name, what_happened, amount_inr,
       incident_date, outcome, account_status, decided_by, decided_at)
    values
      (new.ticket_id, t.ticket_no, v_id, v_kind, v_name, v_note, d.amount_inr, d.incident_date,
       new.fraud_outcome, (select pr.account_status::text from public.profiles pr where pr.id = v_id),
       new.reviewed_by, coalesce(new.reviewed_at, now()))
    on conflict (ticket_id) do update
      set outcome = excluded.outcome,
          what_happened = coalesce(excluded.what_happened, f.what_happened),
          account_status = excluded.account_status,
          decided_by = excluded.decided_by,
          decided_at = excluded.decided_at,
          withdrawn_at = null;
  else
    update admin.fraud_findings set withdrawn_at = now()
     where ticket_id = new.ticket_id and withdrawn_at is null;
  end if;
  return null;
end
$function$;
revoke all on function admin.fraud_finding_on_outcome() from public, anon, authenticated;

create trigger trg_fraud_finding_on_outcome
  after update of fraud_outcome on public.support_ticket_staff
  for each row
  when (new.fraud_outcome is distinct from old.fraud_outcome)
  execute function admin.fraud_finding_on_outcome();

create function public.admin_fraud_findings(p_limit integer default 200)
returns table (id uuid, ticket_no text, subject_profile_id uuid, subject_kind text, subject_name text,
               what_happened text, amount_inr numeric, incident_date date, outcome text, account_status text,
               decided_by_name text, decided_at timestamptz, withdrawn_at timestamptz, report_purged_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if not admin.support_can_read() then
    raise exception 'not authorized: support is for super admins, support and managers' using errcode = '42501';
  end if;
  return query
    select f.id, f.ticket_no, f.subject_profile_id, f.subject_kind, f.subject_name, f.what_happened, f.amount_inr,
           f.incident_date, f.outcome, f.account_status, admin.audit_actor_name(f.decided_by), f.decided_at,
           f.withdrawn_at, f.report_purged_at
      from admin.fraud_findings f
     order by f.decided_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end
$function$;
revoke all on function public.admin_fraud_findings(integer) from public, anon;
grant execute on function public.admin_fraud_findings(integer) to authenticated;

-- ── 2. The sweep ─────────────────────────────────────────────────────────────
-- What the sweep deleted, by ticket number only: no message, no name, no file.
create table if not exists admin.support_purge_log (
  ticket_no  text not null,
  channel    text not null,
  reason     text not null check (reason in ('fraud_report_one_year', 'account_deleted')),
  files      integer not null default 0,
  purged_at  timestamptz not null default now()
);
alter table admin.support_purge_log enable row level security;
revoke all on admin.support_purge_log from public, anon, authenticated;

-- The requests due for deletion, with why. One definition, used by both functions below.
create or replace function admin.support_purge_due()
returns table (ticket_id uuid, ticket_no text, channel text, reason text)
language sql stable set search_path = '' as $function$
  select t.id, t.ticket_no, t.channel,
         case when t.channel = 'fraud_report' then 'fraud_report_one_year' else 'account_deleted' end
    from public.support_tickets t
    left join public.profiles pr on pr.id = t.requester_id
   where (t.channel = 'fraud_report'
          and t.created_at < now() - interval '1 year'
          and t.status in ('resolved', 'closed'))
      or (t.channel <> 'fraud_report'
          and (t.requester_id is null or pr.account_status::text = 'deleted'));
$function$;
revoke all on function admin.support_purge_due() from public, anon, authenticated;

create function public.support_sweep_run(p_limit integer default 50)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  r        record;
  v_closed int := 0;
  v_missed int := 0;
  v_purge  jsonb;
  v_lim    int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'support_sweep_run is for the support-sweep edge function only' using errcode = '42501';
  end if;

  -- a. Resolved 7 days ago and nobody replied since (a reply reopens it): closed.
  for r in
    select t.id, t.ticket_no, t.requester_id
      from public.support_tickets t
     where t.status = 'resolved' and t.resolved_at < now() - interval '7 days'
     order by t.resolved_at
     limit v_lim
       for update skip locked
  loop
    update public.support_tickets set status = 'closed', closed_at = now() where id = r.id;
    insert into public.support_events (ticket_id, actor_kind, event, from_status, to_status, detail)
    values (r.id, 'system', 'auto_closed', 'resolved', 'closed', jsonb_build_object('after_days', 7));
    perform admin.support_system_message(r.id, 'closed',
      'This request is closed. Start a new one if you need more help.', '{}'::jsonb, 'public');
    if r.requester_id is not null then
      perform admin.support_notify(r.requester_id, 'support_status', 'Request closed',
        'Your request ' || r.ticket_no || ' was closed.');
    end if;
    v_closed := v_closed + 1;
  end loop;

  -- b. A callback window that ended with no call logged: flagged once, for staff only.
  for r in
    select t.id
      from public.support_tickets t
      join public.support_callbacks cb on cb.ticket_id = t.id
     where t.channel = 'callback' and t.status in ('new', 'open')
       and cb.outcome = 'pending' and cb.attempts = 0
       and ((cb.preferred_date + cb.window_end) at time zone 'Asia/Kolkata') < now()
       and not exists (select 1 from public.support_events e
                        where e.ticket_id = t.id and e.event = 'callback_window_missed')
     limit v_lim
  loop
    insert into public.support_events (ticket_id, actor_kind, event, detail)
    values (r.id, 'system', 'callback_window_missed', '{}'::jsonb);
    perform admin.support_system_message(r.id, 'callback_window_missed',
      'The callback window ended with no call logged.', '{}'::jsonb, 'internal');
    v_missed := v_missed + 1;
  end loop;

  -- c. What's due for deletion, with the storage paths the function deletes first.
  select coalesce(jsonb_agg(jsonb_build_object(
           'ticket_id', d.ticket_id, 'ticket_no', d.ticket_no, 'reason', d.reason,
           'paths', coalesce((select jsonb_agg(a.storage_path order by a.storage_path)
                                from public.support_attachments a where a.ticket_id = d.ticket_id), '[]'::jsonb))), '[]'::jsonb)
    into v_purge
    from (select * from admin.support_purge_due() limit v_lim) d;

  return jsonb_build_object('closed', v_closed, 'callbacks_flagged', v_missed, 'purge', v_purge);
end
$function$;

create function public.support_sweep_purge(p_ticket_ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = '' as $function$
declare
  r     record;
  v_n   int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'support_sweep_purge is for the support-sweep edge function only' using errcode = '42501';
  end if;
  -- support_messages and support_events are append-only (admin.support_append_only);
  -- this transaction-local switch is the scrub's sanctioned way past it (P2, for D-16).
  perform set_config('cosora.support_scrub', 'on', true);
  -- Re-checked here: only requests still due are deleted, whatever was passed in.
  for r in
    select d.ticket_id, d.ticket_no, d.channel, d.reason,
           (select count(*) from public.support_attachments a where a.ticket_id = d.ticket_id)::int as files
      from admin.support_purge_due() d
     where d.ticket_id = any (coalesce(p_ticket_ids, '{}'::uuid[]))
  loop
    update admin.fraud_findings set report_purged_at = now(), ticket_id = null where ticket_id = r.ticket_id;
    delete from public.support_tickets where id = r.ticket_id;   -- messages, files, events, callbacks cascade
    insert into admin.support_purge_log (ticket_no, channel, reason, files) values (r.ticket_no, r.channel, r.reason, r.files);
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$function$;

revoke all on function public.support_sweep_run(integer) from public, anon, authenticated;
revoke all on function public.support_sweep_purge(uuid[]) from public, anon, authenticated;
grant execute on function public.support_sweep_run(integer) to service_role;
grant execute on function public.support_sweep_purge(uuid[]) to service_role;

-- ── 3. Email receipts ────────────────────────────────────────────────────────
-- Whether the signed-in requester can get a receipt for this request, and where to.
create function public.support_receipt_target(p_ticket_no text, p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  t       public.support_tickets;
  v_email text;
  v_conf  timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'support_receipt_target is for the support-receipt edge function only' using errcode = '42501';
  end if;
  select * into t from public.support_tickets where ticket_no = p_ticket_no and requester_id = p_user;
  if not found or t.channel not in ('feedback', 'fraud_report') then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from public.support_events e where e.ticket_id = t.id and e.event = 'receipt_emailed') then
    return jsonb_build_object('status', 'already_sent');
  end if;
  if (select count(*) from public.support_events e where e.ticket_id = t.id and e.event = 'receipt_failed') >= 3 then
    return jsonb_build_object('status', 'send_failed');
  end if;
  select u.email, u.email_confirmed_at into v_email, v_conf from auth.users u where u.id = p_user;
  -- Phone sign-in accounts carry a placeholder address that reaches no one.
  if v_email is null or v_conf is null or v_email ilike '%@phone.cosora.invalid' then
    return jsonb_build_object('status', 'no_email');
  end if;
  return jsonb_build_object('status', 'ok', 'ticket_id', t.id, 'ticket_no', t.ticket_no, 'channel', t.channel,
                            'language', t.language, 'email', v_email);
end
$function$;

create function public.support_receipt_record(p_ticket_id uuid, p_sent boolean, p_detail text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'support_receipt_record is for the support-receipt edge function only' using errcode = '42501';
  end if;
  insert into public.support_events (ticket_id, actor_kind, event, detail)
  values (p_ticket_id, 'system', case when p_sent then 'receipt_emailed' else 'receipt_failed' end,
          case when p_detail is null then '{}'::jsonb else jsonb_build_object('detail', left(p_detail, 200)) end);
end
$function$;

revoke all on function public.support_receipt_target(text, uuid) from public, anon, authenticated;
revoke all on function public.support_receipt_record(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.support_receipt_target(text, uuid) to service_role;
grant execute on function public.support_receipt_record(uuid, boolean, text) to service_role;

-- ── 4. Self-check ────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.support_sweep_run(integer)', 'public.support_sweep_purge(uuid[])',
    'public.support_receipt_target(text,uuid)', 'public.support_receipt_record(uuid,boolean,text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '% must be service_role only', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.admin_fraud_findings(integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.admin_fraud_findings(integer)', 'EXECUTE') then
    raise exception 'admin_fraud_findings must be for authenticated only';
  end if;
  if has_table_privilege('authenticated', 'admin.fraud_findings', 'SELECT')
     or has_table_privilege('authenticated', 'admin.support_purge_log', 'SELECT') then
    raise exception 'the admin tables must not be readable by a client role';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_fraud_finding_on_outcome'
                  and tgrelid = 'public.support_ticket_staff'::regclass) then
    raise exception 'trg_fraud_finding_on_outcome is missing';
  end if;
  if exists (select 1 from cron.job where jobname = 'support-sweep') then
    raise exception 'the support sweep must not be scheduled by this migration (it waits for approval, D-21)';
  end if;
end
$check$;
