-- Help & Support, phase P2c (documentation/help-feature-plan.md), 2026-09-30.
--
-- What Cosora-Admin's Support section calls. Who (D-08; Cosora-Admin roles.ts
-- "support" and "support-settings"; change the gates here and there together):
--   read   super_admin, support, manager     admin.support_can_read()
--   act    super_admin, support              admin.support_can_write()
--   settings (hours, holidays, rollout, contact, topics): super_admin only
--   Quick Guides: super_admin and support, the FAQ editors
--
--   admin_support_list(...)            the inbox, filtered and paged
--   admin_support_counts()             badge and tab counts
--   admin_support_get(ticket_no)       one ticket: thread with internal notes, files, events, requester, context
--   admin_support_assignees()          who a ticket can be assigned to
--   admin_support_claim(id)            assign it to me
--   admin_support_reassign(id, admin)  assign it to someone else, or nobody
--   admin_support_reply(...)           a public reply or an internal note, with files
--   admin_support_prepare_upload(...)  reserve a storage path for a staff file
--   admin_support_set_status(...)      resolve, reopen, close
--   admin_support_reveal_contact(...)  a phone number, logged in the Admin Log
--   admin_callback_log_attempt(...)    completed, no answer, wrong number, cancelled
--   admin_fraud_set_outcome(...)       the verdict on a fraud report (the reporter sees only "reviewed")
--   admin_feedback_mark_reviewed(...)  feedback read
--   admin_support_settings() and the setters; admin_help_guide_list/save/delete

-- ── Helpers ────────────────────────────────────────────────────────────────────
create or replace function admin.support_require_read()
returns void language plpgsql stable set search_path = '' as $function$
begin
  if not admin.support_can_read() then
    raise exception 'not authorized: support is for super admins, support and managers' using errcode = '42501';
  end if;
end
$function$;

create or replace function admin.support_require_write()
returns void language plpgsql stable set search_path = '' as $function$
begin
  if not admin.support_can_write() then
    raise exception 'not authorized: answering support is for super admins and support' using errcode = '42501';
  end if;
end
$function$;

create or replace function admin.help_content_require(p_write boolean)
returns void language plpgsql stable set search_path = '' as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[]), false) then
    raise exception 'not authorized: help content is edited by super admins and support' using errcode = '42501';
  end if;
end
$function$;

-- "+918815578226" -> "+91•••••••226". Enough to recognise, not to dial: the country
-- code shows only on a full international number, and a short number (a landline
-- such as 22334455) shows its last 3 digits only, so at least 5 stay hidden.
create or replace function admin.support_mask_phone(p text)
returns text language sql immutable set search_path = '' as $function$
  select case when p is null or p = '' then null
              when p like '+%' and char_length(p) >= 12
                then left(p, 3) || repeat('•', char_length(p) - 6) || right(p, 3)
              else repeat('•', greatest(char_length(p) - 3, 5)) || right(p, 3) end;
$function$;

create or replace function admin.support_account_name(p_uid uuid)
returns text language sql stable set search_path = '' as $function$
  select coalesce(nullif(btrim(vp.brand_name), ''), nullif(btrim(bp.company), ''), nullif(btrim(p.full_name), ''),
                  nullif(btrim(bp.display_name), ''), 'Unnamed account')
    from public.profiles p
    left join public.vendor_profiles vp on vp.id = p.id
    left join public.buyer_profiles bp on bp.id = p.id
   where p.id = p_uid;
$function$;

-- Lock a ticket for a staff action. Closed tickets are read-only.
create or replace function admin.support_lock_ticket(p_ticket_id uuid, p_allow_closed boolean)
returns public.support_tickets language plpgsql volatile set search_path = '' as $function$
declare
  v_t public.support_tickets;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id for update;
  if not found then
    raise exception 'no ticket %', p_ticket_id using errcode = 'P0002';
  end if;
  if v_t.status = 'closed' and not p_allow_closed then
    raise exception 'ticket % is closed', v_t.ticket_no using errcode = 'P0001', hint = 'closed';
  end if;
  return v_t;
end
$function$;

-- Give an unassigned ticket to the staff member acting on it.
create or replace function admin.support_take_if_unassigned(p_ticket_id uuid)
returns void language plpgsql volatile set search_path = '' as $function$
begin
  update public.support_ticket_staff
     set assignee_id = auth.uid(), assigned_at = now(), updated_at = now()
   where ticket_id = p_ticket_id and assignee_id is null;
end
$function$;

create or replace function admin.support_event(
  p_ticket_id uuid, p_event text, p_from text, p_to text, p_detail jsonb)
returns void language sql volatile set search_path = '' as $function$
  insert into public.support_events (ticket_id, actor_id, actor_kind, event, from_status, to_status, detail)
  values (p_ticket_id, auth.uid(), 'staff', p_event, p_from, p_to, coalesce(p_detail, '{}'::jsonb));
$function$;

create or replace function admin.support_internal_note(p_ticket_id uuid, p_body text)
returns void language sql volatile set search_path = '' as $function$
  insert into public.support_messages (ticket_id, author_id, author_kind, visibility, kind, body)
  select p_ticket_id, auth.uid(), 'staff', 'internal', 'text', left(btrim(p_body), 4000)
   where nullif(btrim(coalesce(p_body, '')), '') is not null;
$function$;

-- ── The inbox ──────────────────────────────────────────────────────────────────
-- "Waiting on us", per channel. Each channel's own to-do, plus the rule for every
-- channel: the requester wrote after we last did (a system line asking them to reply
-- doesn't count as our reply, so their answer to it is flagged).
--   chat          the requester wrote after the latest public staff reply
--   callback      a call still to be made, or the requester wrote after the latest
--                 staff reply or call attempt (e.g. "reply with the right number")
--   fraud_report  no outcome recorded yet, or the requester wrote after the latest reply
--   feedback      not marked reviewed and not waiting on the requester; taking it
--                 (new -> open) doesn't count as reading it
-- waiting_at is when that began. For a callback still to be made it is the booked
-- slot's start, which can be in the future: the UI shows it as "due", and
-- admin_support_counts leaves future slots out of the oldest-waiting figure.
create or replace view admin.support_ticket_rows as
with base as (
  select t.*, s.assignee_id, s.assigned_at, s.reviewed_at, s.fraud_outcome,
         cb.preferred_date, cb.window_start, cb.window_end, cb.outcome as callback_outcome, cb.attempts as callback_attempts,
         cb.last_attempt_at as callback_last_attempt_at,
         agg.last_req_at, agg.last_staff_at, agg.message_count
    from public.support_tickets t
    join public.support_ticket_staff s on s.ticket_id = t.id
    left join public.support_callbacks cb on cb.ticket_id = t.id
    left join lateral (
      select max(m.created_at) filter (where m.author_kind = 'requester') as last_req_at,
             max(m.created_at) filter (where m.author_kind = 'staff' and m.visibility = 'public') as last_staff_at,
             (count(*) filter (where m.kind <> 'event'))::int as message_count
        from public.support_messages m where m.ticket_id = t.id) agg on true
),
seen as (
  -- The last time staff acted where the requester could see it.
  select b.*,
         case when b.channel = 'callback'
              then greatest(coalesce(b.last_staff_at, '-infinity'::timestamptz),
                            coalesce(b.callback_last_attempt_at, '-infinity'::timestamptz))
              else coalesce(b.last_staff_at, '-infinity'::timestamptz) end as staff_seen_at
    from base b
)
select b.*,
       coalesce(b.status in ('new', 'open') and case b.channel
         when 'callback' then b.callback_outcome = 'pending' or b.last_req_at > b.staff_seen_at
         when 'fraud_report' then b.fraud_outcome is null or b.last_req_at > b.staff_seen_at
         when 'feedback' then b.reviewed_at is null and (b.last_staff_at is null or b.last_req_at > b.staff_seen_at)
         else b.last_req_at > b.staff_seen_at
       end, false) as awaiting_staff,
       case
         when b.channel = 'callback' and b.callback_outcome = 'pending'
           then (b.preferred_date + b.window_start) at time zone 'Asia/Kolkata'
         when b.channel = 'fraud_report' and b.fraud_outcome is null then b.created_at
         when b.channel = 'feedback' and b.last_staff_at is null then b.created_at
         else (select min(m.created_at) from public.support_messages m
                where m.ticket_id = b.id and m.author_kind = 'requester' and m.created_at > b.staff_seen_at)
       end as waiting_at
  from seen b;
revoke all on admin.support_ticket_rows from public, anon, authenticated;

create or replace function public.admin_support_list(
  p_view         text    default 'active',
  p_channel      text    default null,
  p_category     text    default null,
  p_side         text    default null,
  p_language     text    default null,
  p_search       text    default null,
  p_include_test boolean default true,
  p_offset       int     default 0,
  p_limit        int     default 50)
returns table(
  id uuid, ticket_no text, channel text, category text, category_label jsonb, status text,
  requester_side text, language text, subject text, requester_id uuid, requester_name text,
  restricted boolean, is_test boolean, created_at timestamptz, last_message_at timestamptz,
  awaiting_staff boolean, waiting_since timestamptz, first_staff_reply_at timestamptz,
  assignee_id uuid, assignee_name text, callback_date date, callback_start text, callback_end text,
  callback_outcome text, callback_attempts int, message_count int, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_view   text := coalesce(p_view, 'active');
  v_limit  int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int  := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_search text := nullif(btrim(p_search), '');
  v_like   text;
  v_me     uuid := auth.uid();
begin
  perform admin.support_require_read();
  if v_view not in ('active', 'awaiting', 'mine', 'unassigned', 'resolved', 'closed', 'all') then
    raise exception 'unknown view %', v_view using errcode = '22023';
  end if;
  if p_channel is not null and p_channel not in ('chat', 'callback', 'fraud_report', 'feedback') then
    raise exception 'unknown channel %', p_channel using errcode = '22023';
  end if;
  if p_side is not null and p_side not in ('buyer', 'vendor') then
    raise exception 'unknown side %', p_side using errcode = '22023';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    with f as (
      select r.*, admin.support_account_name(r.requester_id) as rname
        from admin.support_ticket_rows r
       where (p_channel is null or r.channel = p_channel)
         and (p_category is null or r.category = p_category)
         and (p_side is null or r.requester_side = p_side)
         and (p_language is null or r.language = p_language)
         and (p_include_test or not r.is_test)
         and case v_view
               when 'active' then r.status in ('new', 'open')
               when 'awaiting' then r.awaiting_staff
               when 'mine' then r.status in ('new', 'open') and r.assignee_id = v_me
               when 'unassigned' then r.status in ('new', 'open') and r.assignee_id is null
               when 'resolved' then r.status = 'resolved'
               when 'closed' then r.status = 'closed'
               else true
             end
    )
    select f.id, f.ticket_no, f.channel, f.category, c.label, f.status, f.requester_side, f.language, f.subject,
           f.requester_id, f.rname, f.restricted, f.is_test, f.created_at, f.last_message_at,
           f.awaiting_staff, case when f.awaiting_staff then f.waiting_at end, f.first_staff_reply_at,
           f.assignee_id, case when f.assignee_id is not null then admin.audit_actor_name(f.assignee_id) end,
           f.preferred_date, to_char(f.window_start, 'HH24:MI'), to_char(f.window_end, 'HH24:MI'),
           f.callback_outcome, f.callback_attempts, f.message_count,
           count(*) over ()
      from f
      join public.support_categories c on c.code = f.category
     where v_search is null
        or f.ticket_no ilike v_like or f.subject ilike v_like or f.rname ilike v_like
     order by
       case when v_view in ('active', 'awaiting', 'mine', 'unassigned') then f.awaiting_staff end desc nulls last,
       case when v_view in ('active', 'awaiting', 'mine', 'unassigned') then f.waiting_at end asc nulls last,
       case when v_view in ('active', 'awaiting', 'mine', 'unassigned') then f.created_at end asc,
       f.last_message_at desc,
       f.id
    offset v_offset
     limit v_limit;
end
$function$;

create or replace function public.admin_support_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v jsonb;
begin
  perform admin.support_require_read();
  select jsonb_build_object(
           'awaiting',          count(*) filter (where r.awaiting_staff),
           'awaiting_chat',     count(*) filter (where r.awaiting_staff and r.channel = 'chat'),
           'awaiting_callback', count(*) filter (where r.awaiting_staff and r.channel = 'callback'),
           'awaiting_fraud',    count(*) filter (where r.awaiting_staff and r.channel = 'fraud_report'),
           'awaiting_feedback', count(*) filter (where r.awaiting_staff and r.channel = 'feedback'),
           'active',            count(*) filter (where r.status in ('new', 'open')),
           'mine',              count(*) filter (where r.status in ('new', 'open') and r.assignee_id = auth.uid()),
           'unassigned',        count(*) filter (where r.status in ('new', 'open') and r.assignee_id is null),
           'callbacks_today',   count(*) filter (where r.channel = 'callback' and r.callback_outcome = 'pending'
                                                   and r.status in ('new', 'open') and r.preferred_date = v_today),
           'callbacks_overdue', count(*) filter (where r.channel = 'callback' and r.callback_outcome = 'pending'
                                                   and r.status in ('new', 'open')
                                                   and (r.preferred_date + r.window_end) at time zone 'Asia/Kolkata' < now()),
           -- A callback booked for later is waiting, but not yet late: leave it out.
           'oldest_waiting_at', min(r.waiting_at) filter (where r.awaiting_staff and r.waiting_at <= now()),
           'open_now',          admin.support_is_open_at(now()),
           'rollout',           (select s.rollout from public.support_settings s where s.singleton))
    into v
    from admin.support_ticket_rows r;
  return v;
end
$function$;

create or replace function public.admin_support_get(p_ticket_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_t public.support_tickets;
  v_s public.support_ticket_staff;
begin
  perform admin.support_require_read();
  select * into v_t from public.support_tickets t where t.ticket_no = p_ticket_no;
  if not found then
    raise exception 'no ticket %', p_ticket_no using errcode = 'P0002';
  end if;
  select * into v_s from public.support_ticket_staff s where s.ticket_id = v_t.id;

  return jsonb_build_object(
    'ticket', to_jsonb(v_t) || jsonb_build_object(
                'category_label', (select c.label from public.support_categories c where c.code = v_t.category)),
    'staff', jsonb_build_object(
               'assignee_id', v_s.assignee_id,
               'assignee_name', case when v_s.assignee_id is not null then admin.audit_actor_name(v_s.assignee_id) end,
               'assigned_at', v_s.assigned_at, 'context', v_s.context, 'fraud_outcome', v_s.fraud_outcome,
               'reviewed_at', v_s.reviewed_at,
               'reviewed_by_name', case when v_s.reviewed_by is not null then admin.audit_actor_name(v_s.reviewed_by) end),
    'requester', (select jsonb_build_object(
                    'id', p.id, 'name', admin.support_account_name(p.id), 'full_name', p.full_name,
                    'account_status', p.account_status::text, 'active_role', p.active_role, 'joined_at', p.created_at,
                    'has_store', exists (select 1 from public.vendor_profiles vp where vp.id = p.id),
                    'is_staff', exists (select 1 from admin.admin_users a where a.id = p.id and a.is_active),
                    -- A phone sign-in account's address is a placeholder no one reads.
                    'email', case when p.email like '%@phone.cosora.invalid' then null else p.email end,
                    'phone_masked', admin.support_mask_phone(p.phone))
                    from public.profiles p where p.id = v_t.requester_id),
    'callback', (select jsonb_build_object(
                   'date', cb.preferred_date, 'start', to_char(cb.window_start, 'HH24:MI'),
                   'end', to_char(cb.window_end, 'HH24:MI'), 'attempts', cb.attempts,
                   'last_attempt_at', cb.last_attempt_at, 'outcome', cb.outcome,
                   'phone_masked', admin.support_mask_phone(cb.phone))
                   from public.support_callbacks cb where cb.ticket_id = v_t.id),
    'fraud', (select jsonb_build_object(
                'reported_name', fd.reported_name, 'reported_phone_masked', admin.support_mask_phone(fd.reported_phone),
                'reported_url', fd.reported_url, 'reported_entity_type', fd.reported_entity_type,
                'reported_entity_id', fd.reported_entity_id,
                'reported_entity_label', case fd.reported_entity_type
                    when 'vendor' then admin.support_account_name(fd.reported_entity_id)
                    when 'buyer' then admin.support_account_name(fd.reported_entity_id)
                    when 'product' then (select x.name from public.products x where x.id = fd.reported_entity_id)
                    when 'ad' then (select x.title from public.advertisements x where x.id = fd.reported_entity_id)
                  end,
                'amount_inr', fd.amount_inr, 'incident_date', fd.incident_date, 'city', fd.city)
                from public.support_fraud_details fd where fd.ticket_id = v_t.id),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', m.id, 'author_kind', m.author_kind, 'author_id', m.author_id,
                  'author_name', case when m.author_kind = 'staff' and m.author_id is not null
                                      then admin.audit_actor_name(m.author_id) end,
                  'visibility', m.visibility, 'kind', m.kind, 'body', m.body, 'event', m.event, 'meta', m.meta,
                  'created_at', m.created_at) order by m.created_at, m.id)
                  from public.support_messages m where m.ticket_id = v_t.id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object(
                     'id', a.id, 'message_id', a.message_id, 'uploader_kind', a.uploader_kind, 'kind', a.kind,
                     'mime', a.mime, 'bytes', a.bytes, 'duration_ms', a.duration_ms, 'path', a.storage_path,
                     'status', a.status, 'requester_can_view', a.requester_can_view, 'created_at', a.created_at)
                     order by a.created_at)
                     from public.support_attachments a where a.ticket_id = v_t.id and a.message_id is not null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                'event', e.event, 'actor_kind', e.actor_kind,
                'actor_name', case when e.actor_kind = 'staff' and e.actor_id is not null then admin.audit_actor_name(e.actor_id) end,
                'from_status', e.from_status, 'to_status', e.to_status, 'detail', e.detail, 'at', e.at) order by e.at, e.id)
                from public.support_events e where e.ticket_id = v_t.id), '[]'::jsonb),
    'other_requests', coalesce((select jsonb_agg(jsonb_build_object(
                        'ticket_no', o.ticket_no, 'channel', o.channel, 'status', o.status, 'subject', o.subject,
                        'created_at', o.created_at) order by o.created_at desc)
                        from (select * from public.support_tickets o
                               where o.requester_id = v_t.requester_id and o.id <> v_t.id
                               order by o.created_at desc limit 10) o), '[]'::jsonb),
    'can_write', admin.support_can_write());
end
$function$;

create or replace function public.admin_support_assignees()
returns table(id uuid, name text, role text)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  perform admin.support_require_read();
  return query
    select a.id, admin.audit_actor_name(a.id), a.admin_role::text
      from admin.admin_users a
     where a.is_active and a.admin_role in ('super_admin', 'support')
     order by 2;
end
$function$;

-- ── Acting on a ticket ─────────────────────────────────────────────────────────
create or replace function public.admin_support_claim(p_ticket_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t public.support_tickets;
begin
  perform admin.support_require_write();
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  update public.support_ticket_staff set assignee_id = auth.uid(), assigned_at = now(), updated_at = now()
   where ticket_id = v_t.id;
  perform admin.support_event(v_t.id, 'claimed', null, null, '{}'::jsonb);
  if v_t.status = 'new' then
    update public.support_tickets set status = 'open' where id = v_t.id;
    perform admin.support_event(v_t.id, 'status', 'new', 'open', '{}'::jsonb);
  end if;
  -- The requester sees the team, never a person (D-06), and only once.
  if v_t.channel = 'chat' and not exists (select 1 from public.support_messages m
                                           where m.ticket_id = v_t.id and m.event = 'joined') then
    perform admin.support_system_message(v_t.id, 'joined', 'Cosora Support has joined the chat.', '{}'::jsonb, 'public');
  end if;
  return jsonb_build_object('assignee_id', auth.uid(), 'status', case when v_t.status = 'new' then 'open' else v_t.status end);
end
$function$;

create or replace function public.admin_support_reassign(p_ticket_id uuid, p_assignee_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t    public.support_tickets;
  v_from uuid;
begin
  perform admin.support_require_write();
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  if p_assignee_id is not null and not exists (select 1 from admin.admin_users a
                                                where a.id = p_assignee_id and a.is_active
                                                  and a.admin_role in ('super_admin', 'support')) then
    raise exception 'a ticket can be assigned only to an active super admin or support admin' using errcode = '22023';
  end if;
  select s.assignee_id into v_from from public.support_ticket_staff s where s.ticket_id = v_t.id;
  update public.support_ticket_staff
     set assignee_id = p_assignee_id, assigned_at = case when p_assignee_id is null then null else now() end,
         updated_at = now()
   where ticket_id = v_t.id;
  perform admin.support_event(v_t.id, 'reassigned', null, null,
                              jsonb_build_object('from', v_from, 'to', p_assignee_id));
end
$function$;

create or replace function public.admin_support_prepare_upload(
  p_ticket_id uuid, p_kind text, p_mime text, p_bytes int, p_duration_ms int default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t public.support_tickets;
begin
  perform admin.support_require_write();
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  -- Visible to the requester only once it is sent in a public reply.
  return admin.support_reserve_upload(v_t.id, auth.uid(), 'staff', p_kind, p_mime, p_bytes, p_duration_ms, false);
end
$function$;

create or replace function public.admin_support_reply(
  p_ticket_id uuid, p_body text, p_internal boolean default false, p_attachment_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_body     text := admin.support_body(p_body, false);
  v_ids      uuid[] := coalesce(p_attachment_ids, '{}');
  v_internal boolean := coalesce(p_internal, false);
  v_t        public.support_tickets;
  v_mid      uuid;
  v_to       text;
begin
  perform admin.support_require_write();
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  if v_body is null and cardinality(v_ids) = 0 then
    raise exception 'write a reply or attach a file' using errcode = '22023';
  end if;
  perform admin.support_check_files(v_t.id, auth.uid(), v_ids);

  insert into public.support_messages (ticket_id, author_id, author_kind, visibility, kind, body)
  values (v_t.id, auth.uid(), 'staff', case when v_internal then 'internal' else 'public' end,
          case when v_body is null then 'attachment' else 'text' end, v_body)
  returning id into v_mid;
  update public.support_attachments set message_id = v_mid, requester_can_view = not v_internal
   where id = any (v_ids);
  perform admin.support_take_if_unassigned(v_t.id);

  if v_internal then
    perform admin.support_event(v_t.id, 'noted', null, null, jsonb_build_object('message_id', v_mid));
    return jsonb_build_object('message_id', v_mid, 'status', v_t.status);
  end if;

  v_to := case when v_t.status in ('new', 'resolved') then 'open' else v_t.status end;
  update public.support_tickets
     set status = v_to,
         resolved_at = case when v_t.status = 'resolved' then null else resolved_at end,
         first_staff_reply_at = coalesce(first_staff_reply_at, now()),
         last_message_at = now()
   where id = v_t.id;
  perform admin.support_event(v_t.id, 'replied', v_t.status, v_to, jsonb_build_object('message_id', v_mid));
  if v_t.requester_id is not null then
    perform admin.support_notify(v_t.requester_id, 'support_reply', 'Cosora Support replied',
      'There''s a new reply on your request ' || v_t.ticket_no || '.');
  end if;
  return jsonb_build_object('message_id', v_mid, 'status', v_to);
end
$function$;

create or replace function public.admin_support_set_status(p_ticket_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t    public.support_tickets;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform admin.support_require_write();
  if p_status not in ('open', 'resolved', 'closed') then
    raise exception 'a ticket can be set to open, resolved or closed' using errcode = '22023';
  end if;
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  if v_t.status = p_status then
    return jsonb_build_object('status', v_t.status);
  end if;
  if v_note is not null then
    -- Carried onto this change's Admin Log row by admin.audit_row_change().
    perform set_config('cosora.audit_reason', left(v_note, 500), true);
    perform admin.support_internal_note(v_t.id, v_note);
  end if;

  update public.support_tickets
     set status = p_status,
         resolved_at = case when p_status = 'resolved' then now() when p_status = 'open' then null else resolved_at end,
         closed_at = case when p_status = 'closed' then now() else closed_at end
   where id = v_t.id;
  perform admin.support_take_if_unassigned(v_t.id);
  perform admin.support_event(v_t.id, 'status', v_t.status, p_status, '{}'::jsonb);

  if p_status = 'resolved' then
    perform admin.support_system_message(v_t.id, 'resolved',
      'Cosora Support marked this request resolved. Reply within 7 days to reopen it.', '{}'::jsonb, 'public');
    if v_t.requester_id is not null then
      perform admin.support_notify(v_t.requester_id, 'support_status', 'Request resolved',
        'Your request ' || v_t.ticket_no || ' was marked resolved.');
    end if;
  elsif p_status = 'closed' then
    perform admin.support_system_message(v_t.id, 'closed',
      'This request is closed. Start a new one if you need more help.', '{}'::jsonb, 'public');
    if v_t.requester_id is not null and v_t.channel <> 'feedback' then
      perform admin.support_notify(v_t.requester_id, 'support_status', 'Request closed',
        'Your request ' || v_t.ticket_no || ' was closed.');
    end if;
  else
    perform admin.support_system_message(v_t.id, 'reopened_by_staff', 'Cosora Support reopened this request.',
      '{}'::jsonb, 'public');
  end if;
  return jsonb_build_object('status', p_status);
end
$function$;

-- A read, recorded as its own Admin Log action (D-08). Readers include manager.
create or replace function public.admin_support_reveal_contact(p_ticket_id uuid, p_field text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t     public.support_tickets;
  v_value text;
  v_uid   uuid := auth.uid();
begin
  perform admin.support_require_read();
  select * into v_t from public.support_tickets t where t.id = p_ticket_id;
  if not found then
    raise exception 'no ticket %', p_ticket_id using errcode = 'P0002';
  end if;
  v_value := case p_field
    when 'requester_phone' then (select p.phone from public.profiles p where p.id = v_t.requester_id)
    when 'callback_phone' then (select cb.phone from public.support_callbacks cb where cb.ticket_id = v_t.id)
    when 'reported_phone' then (select fd.reported_phone from public.support_fraud_details fd where fd.ticket_id = v_t.id)
  end;
  if p_field not in ('requester_phone', 'callback_phone', 'reported_phone') then
    raise exception 'unknown contact field %', p_field using errcode = '22023';
  end if;
  insert into admin.audit_log (actor_id, actor_role, actor_name, action, target_table, target_id, changes, source)
  values (v_uid, public.admin_role(), admin.audit_actor_name(v_uid), 'reveal_contact', 'public.support_tickets',
          v_t.id::text, jsonb_build_object('field', p_field, 'ticket_no', v_t.ticket_no, 'found', v_value is not null),
          'admin-app');
  insert into public.support_events (ticket_id, actor_id, actor_kind, event, detail)
  values (v_t.id, v_uid, 'staff', 'contact_revealed', jsonb_build_object('field', p_field));
  return jsonb_build_object('field', p_field, 'value', v_value);
end
$function$;

create or replace function public.admin_callback_log_attempt(p_ticket_id uuid, p_outcome text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t        public.support_tickets;
  v_cb       public.support_callbacks;
  v_attempts int;
  v_outcome  text;
  v_status   text;
begin
  perform admin.support_require_write();
  if p_outcome not in ('completed', 'no_answer', 'wrong_number', 'cancelled') then
    raise exception 'unknown callback outcome %', p_outcome using errcode = '22023';
  end if;
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  if v_t.channel <> 'callback' then
    raise exception 'ticket % is not a callback request', v_t.ticket_no using errcode = '22023';
  end if;
  select * into v_cb from public.support_callbacks cb where cb.ticket_id = v_t.id for update;
  if v_cb.outcome <> 'pending' then
    raise exception 'this callback is already %', replace(v_cb.outcome, '_', ' ') using errcode = 'P0001';
  end if;

  v_attempts := v_cb.attempts + case when p_outcome = 'cancelled' then 0 else 1 end;
  -- Up to three tries before a missed callback stops being retried.
  v_outcome := case when p_outcome = 'no_answer' and v_attempts < 3 then 'pending' else p_outcome end;
  update public.support_callbacks
     set attempts = v_attempts, outcome = v_outcome,
         last_attempt_at = case when p_outcome = 'cancelled' then last_attempt_at else now() end
   where ticket_id = v_t.id;
  perform admin.support_internal_note(v_t.id, p_note);
  perform admin.support_take_if_unassigned(v_t.id);

  v_status := case when p_outcome in ('completed', 'cancelled') then 'resolved' else 'open' end;
  update public.support_tickets
     set status = v_status,
         resolved_at = case when v_status = 'resolved' then now() else null end,
         last_message_at = now()
   where id = v_t.id;
  perform admin.support_event(v_t.id, 'callback_attempt', v_t.status, v_status,
                              jsonb_build_object('outcome', p_outcome, 'attempt', v_attempts));

  if p_outcome = 'completed' then
    perform admin.support_system_message(v_t.id, 'callback_completed',
      'We called you. If there''s anything else, reply here.', '{}'::jsonb, 'public');
  elsif p_outcome = 'no_answer' then
    perform admin.support_system_message(v_t.id, 'callback_missed',
      case when v_outcome = 'no_answer'
           then 'We tried to call you 3 times and couldn''t reach you. Reply here to book another time.'
           else 'We tried to call you and couldn''t reach you. We''ll try again.' end,
      jsonb_build_object('attempt', v_attempts, 'final', v_outcome = 'no_answer'), 'public');
    if v_t.requester_id is not null then
      perform admin.support_notify(v_t.requester_id, 'support_callback', 'We missed you',
        'We tried to call you about request ' || v_t.ticket_no || '.');
    end if;
  elsif p_outcome = 'wrong_number' then
    perform admin.support_system_message(v_t.id, 'callback_wrong_number',
      'We couldn''t reach you on the number you gave. Reply here with the right number.', '{}'::jsonb, 'public');
    if v_t.requester_id is not null then
      perform admin.support_notify(v_t.requester_id, 'support_callback', 'Check your number',
        'We couldn''t reach you about request ' || v_t.ticket_no || '.');
    end if;
  else
    perform admin.support_system_message(v_t.id, 'callback_cancelled', 'This callback was cancelled.', '{}'::jsonb, 'public');
  end if;
  return jsonb_build_object('outcome', v_outcome, 'attempts', v_attempts, 'status', v_status);
end
$function$;

create or replace function public.admin_fraud_set_outcome(p_ticket_id uuid, p_outcome text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t public.support_tickets;
begin
  perform admin.support_require_write();
  if p_outcome not in ('no_action', 'warned', 'suspended', 'escalated_legal') then
    raise exception 'unknown outcome %', p_outcome using errcode = '22023';
  end if;
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  if v_t.channel <> 'fraud_report' then
    raise exception 'ticket % is not a fraud report', v_t.ticket_no using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    perform set_config('cosora.audit_reason', left(btrim(p_note), 500), true);
    perform admin.support_internal_note(v_t.id, p_note);
  end if;
  update public.support_ticket_staff
     set fraud_outcome = p_outcome, reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
   where ticket_id = v_t.id;
  perform admin.support_take_if_unassigned(v_t.id);
  update public.support_tickets set status = 'resolved', resolved_at = now() where id = v_t.id;
  perform admin.support_event(v_t.id, 'fraud_outcome', v_t.status, 'resolved', jsonb_build_object('outcome', p_outcome));
  -- The reporter never learns the verdict, only that the report was reviewed.
  perform admin.support_system_message(v_t.id, 'report_reviewed',
    'Our team has reviewed your report. Thank you for telling us.', '{}'::jsonb, 'public');
  if v_t.requester_id is not null then
    perform admin.support_notify(v_t.requester_id, 'support_status', 'Report reviewed',
      'We''ve reviewed your report ' || v_t.ticket_no || '.');
  end if;
  return jsonb_build_object('outcome', p_outcome, 'status', 'resolved');
end
$function$;

create or replace function public.admin_feedback_mark_reviewed(p_ticket_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_t public.support_tickets;
begin
  perform admin.support_require_write();
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  if v_t.channel <> 'feedback' then
    raise exception 'ticket % is not feedback', v_t.ticket_no using errcode = '22023';
  end if;
  perform admin.support_internal_note(v_t.id, p_note);
  update public.support_ticket_staff set reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
   where ticket_id = v_t.id;
  update public.support_tickets set status = 'closed', closed_at = now() where id = v_t.id;
  perform admin.support_event(v_t.id, 'feedback_reviewed', v_t.status, 'closed', '{}'::jsonb);
  perform admin.support_system_message(v_t.id, 'feedback_reviewed', 'The team has read your feedback. Thank you.',
    '{}'::jsonb, 'public');
  return jsonb_build_object('status', 'closed');
end
$function$;

-- ── Settings (super_admin writes) ──────────────────────────────────────────────
create or replace function public.admin_support_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  s public.support_settings;
begin
  perform admin.support_require_read();
  select * into s from public.support_settings where singleton;
  return jsonb_build_object(
    'rollout', s.rollout,
    'test_profiles', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', admin.support_account_name(x.id)))
                                 from unnest(s.test_profile_ids) as x(id)), '[]'::jsonb),
    'phone', s.support_phone, 'email', s.support_email,
    'updated_at', s.updated_at,
    'updated_by_name', case when s.updated_by is not null then admin.audit_actor_name(s.updated_by) end,
    'hours', (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'is_open', h.is_open,
                                                  'open', to_char(h.open_time, 'HH24:MI'),
                                                  'close', to_char(h.close_time, 'HH24:MI')) order by h.weekday)
                from public.support_hours h),
    'holidays', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'label', d.label) order by d.day)
                            from public.support_holidays d
                           where d.day >= (now() at time zone 'Asia/Kolkata')::date - 30), '[]'::jsonb),
    'categories', (select jsonb_agg(jsonb_build_object('code', c.code, 'audience', c.audience, 'channels', c.channels,
                                                       'label', c.label, 'restricted', c.restricted,
                                                       'position', c.position, 'active', c.active) order by c.position)
                     from public.support_categories c),
    'open_now', admin.support_is_open_at(now()),
    'next_open_at', admin.support_next_open_at(now()),
    'can_edit', coalesce(public.admin_role()::text = 'super_admin', false));
end
$function$;

create or replace function public.admin_support_set_hours(p_hours jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  d      jsonb;
  v_day  int;
  v_open boolean;
  v_from time;
  v_to   time;
begin
  perform admin.require_content_admin();
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then
    raise exception 'give all seven days' using errcode = '22023';
  end if;
  for d in select * from jsonb_array_elements(p_hours) loop
    v_day  := (d ->> 'weekday')::int;
    v_open := coalesce((d ->> 'is_open')::boolean, false);
    v_from := case when v_open then (d ->> 'open')::time end;
    v_to   := case when v_open then (d ->> 'close')::time end;
    if v_day is null or v_day not between 0 and 6 then
      raise exception 'weekday must be 0 (Sunday) to 6' using errcode = '22023';
    end if;
    if v_open and (v_from is null or v_to is null or v_from >= v_to) then
      raise exception 'on an open day, opening must be before closing' using errcode = '22023';
    end if;
    update public.support_hours set is_open = v_open, open_time = v_from, close_time = v_to where weekday = v_day;
  end loop;
  if (select count(distinct (e.x ->> 'weekday')) from jsonb_array_elements(p_hours) as e(x)) <> 7 then
    raise exception 'each weekday once' using errcode = '22023';
  end if;
end
$function$;

create or replace function public.admin_support_holiday_add(p_day date, p_label text)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  perform admin.require_content_admin();
  if p_day is null or v_label is null or char_length(v_label) > 80 then
    raise exception 'a holiday needs a date and a name of up to 80 characters' using errcode = '22023';
  end if;
  insert into public.support_holidays (day, label, created_by) values (p_day, v_label, auth.uid())
  on conflict (day) do update set label = excluded.label;
end
$function$;

create or replace function public.admin_support_holiday_remove(p_day date)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  perform admin.require_content_admin();
  delete from public.support_holidays where day = p_day;
end
$function$;

create or replace function public.admin_support_set_rollout(p_rollout text, p_test_profile_ids uuid[] default null)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_ids uuid[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_test_profile_ids, '{}')) x), '{}');
begin
  perform admin.require_content_admin();
  if p_rollout not in ('off', 'staff', 'all') then
    raise exception 'rollout is off, staff or all' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 20 then
    raise exception 'at most 20 test accounts' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.profiles p where p.id = x)) then
    raise exception 'a test account does not exist' using errcode = 'P0002';
  end if;
  update public.support_settings
     set rollout = p_rollout, test_profile_ids = v_ids, updated_by = auth.uid(), updated_at = now()
   where singleton;
end
$function$;

create or replace function public.admin_support_set_contact(p_phone text, p_email text)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_phone text := admin.support_phone(p_phone);
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  perform admin.require_content_admin();
  if v_phone is null or left(v_phone, 1) <> '+' then
    raise exception 'give the phone number with its country code, e.g. +91 …' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'give a valid email address' using errcode = '22023';
  end if;
  update public.support_settings
     set support_phone = v_phone, support_email = v_email, updated_by = auth.uid(), updated_at = now()
   where singleton;
end
$function$;

create or replace function public.admin_support_category_set_active(p_code text, p_active boolean)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  perform admin.require_content_admin();
  update public.support_categories set active = coalesce(p_active, false) where code = p_code;
  if not found then
    raise exception 'no topic %', p_code using errcode = 'P0002';
  end if;
end
$function$;

-- ── Quick Guides (the FAQ editors: super_admin and support) ────────────────────
create or replace function public.admin_help_guide_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  perform admin.help_content_require(false);
  return coalesce((select jsonb_agg(jsonb_build_object(
                     'id', g.id, 'slug', g.slug, 'audience', g.audience, 'title', g.title, 'body', g.body,
                     'position', g.position, 'active', g.active, 'verified_at', g.verified_at,
                     'updated_at', g.updated_at,
                     'updated_by_name', case when g.updated_by is not null then admin.audit_actor_name(g.updated_by) end)
                     order by g.position, g.created_at)
                     from public.help_guides g), '[]'::jsonb);
end
$function$;

create or replace function public.admin_help_guide_save(
  p_id uuid, p_slug text, p_audience text, p_title jsonb, p_body jsonb,
  p_position int default 0, p_active boolean default false, p_verified boolean default false)
returns uuid language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_id   uuid;
  k      text;
begin
  perform admin.help_content_require(true);
  if v_slug !~ '^[a-z0-9][a-z0-9-]{2,59}$' then
    raise exception 'the slug is 3 to 60 lowercase letters, digits or hyphens' using errcode = '22023';
  end if;
  if p_audience not in ('buyer', 'vendor', 'both') then
    raise exception 'audience is buyer, vendor or both' using errcode = '22023';
  end if;
  if jsonb_typeof(p_title) <> 'object' or jsonb_typeof(p_body) <> 'object'
     or coalesce(btrim(p_title ->> 'en'), '') = '' or coalesce(btrim(p_body ->> 'en'), '') = '' then
    raise exception 'a guide needs an English title and body' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_title) union select jsonb_object_keys(p_body) loop
    if k not in ('en', 'hi', 'gu') then
      raise exception 'unknown language %', k using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_each_text(p_title) e where char_length(e.value) > 120)
     or exists (select 1 from jsonb_each_text(p_body) e where char_length(e.value) > 8000) then
    raise exception 'a title is at most 120 characters and a body at most 8,000' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.help_guides (slug, audience, title, body, position, active, verified_at, updated_by)
    values (v_slug, p_audience, p_title, p_body, coalesce(p_position, 0), coalesce(p_active, false),
            case when p_verified then now() end, auth.uid())
    returning id into v_id;
  else
    update public.help_guides
       set slug = v_slug, audience = p_audience, title = p_title, body = p_body,
           position = coalesce(p_position, 0), active = coalesce(p_active, false),
           verified_at = case when p_verified then coalesce(verified_at, now()) end,
           updated_by = auth.uid(), updated_at = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'no guide %', p_id using errcode = 'P0002';
    end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'another guide already uses the slug %', v_slug using errcode = '23505';
end
$function$;

create or replace function public.admin_help_guide_delete(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  perform admin.help_content_require(true);
  delete from public.help_guides where id = p_id;
  if not found then
    raise exception 'no guide %', p_id using errcode = 'P0002';
  end if;
end
$function$;

-- ── Grants ─────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'admin.support_require_read()', 'admin.support_require_write()', 'admin.help_content_require(boolean)',
    'admin.support_mask_phone(text)', 'admin.support_account_name(uuid)',
    'admin.support_lock_ticket(uuid, boolean)', 'admin.support_take_if_unassigned(uuid)',
    'admin.support_event(uuid, text, text, text, jsonb)', 'admin.support_internal_note(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.admin_support_list(text, text, text, text, text, text, boolean, integer, integer)',
    'public.admin_support_counts()', 'public.admin_support_get(text)', 'public.admin_support_assignees()',
    'public.admin_support_claim(uuid)', 'public.admin_support_reassign(uuid, uuid)',
    'public.admin_support_prepare_upload(uuid, text, text, integer, integer)',
    'public.admin_support_reply(uuid, text, boolean, uuid[])',
    'public.admin_support_set_status(uuid, text, text)', 'public.admin_support_reveal_contact(uuid, text)',
    'public.admin_callback_log_attempt(uuid, text, text)', 'public.admin_fraud_set_outcome(uuid, text, text)',
    'public.admin_feedback_mark_reviewed(uuid, text)', 'public.admin_support_settings()',
    'public.admin_support_set_hours(jsonb)', 'public.admin_support_holiday_add(date, text)',
    'public.admin_support_holiday_remove(date)', 'public.admin_support_set_rollout(text, uuid[])',
    'public.admin_support_set_contact(text, text)', 'public.admin_support_category_set_active(text, boolean)',
    'public.admin_help_guide_list()',
    'public.admin_help_guide_save(uuid, text, text, jsonb, jsonb, integer, boolean, boolean)',
    'public.admin_help_guide_delete(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$grants$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  r record;
begin
  for r in select p.oid::regprocedure::text as f, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like 'admin\_support\_%' or p.proname like 'admin\_help\_guide\_%'
                                            or p.proname in ('admin_callback_log_attempt', 'admin_fraud_set_outcome',
                                                             'admin_feedback_mark_reviewed')) loop
    if has_function_privilege('anon', r.f, 'EXECUTE') or not has_function_privilege('authenticated', r.f, 'EXECUTE') then
      raise exception 'self-check: grants on % are wrong', r.f;
    end if;
    if not r.prosecdef or not (r.proconfig @> array['search_path=""']) then
      raise exception 'self-check: % is not SECURITY DEFINER with an empty search_path', r.f;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and (p.proname like 'admin\_support\_%' or p.proname like 'admin\_help\_guide\_%'
                                       or p.proname in ('admin_callback_log_attempt', 'admin_fraud_set_outcome',
                                                        'admin_feedback_mark_reviewed'))) <> 23 then
    raise exception 'self-check: expected 23 admin support functions, one overload each';
  end if;
  if has_table_privilege('authenticated', 'admin.support_ticket_rows', 'SELECT') then
    raise exception 'self-check: clients can read admin.support_ticket_rows';
  end if;
end
$check$;
