-- Staff see whether an account's email is verified (buyer sign-up audit 2026-11-13, item 14b; plan task A6).
--
-- Account Info lets a buyer type any email; it is saved on profiles and shown to staff beside the account, though no
-- one ever confirmed it (sign-in is the phone, and the dummy code at that). Staff now see which addresses are confirmed.
--   admin_email_verified(ids)     per account: true when the profile's email is the account's confirmed sign-in
--                                 email, false when it is anything else, null when there is none (or only the phone
--                                 sign-in placeholder). The same roles as admin_profile_emails().
--   admin_support_get()           requester.email_verified, the same answer; requester.has_store now follows
--                                 admin.is_real_seller() (20261114100200), so a buyer who once ticked "Seller" on
--                                 Register isn't shown as a store.

create or replace function public.admin_email_verified(p_ids uuid[])
returns table (id uuid, email_verified boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.is_admin(), false)
     or public.admin_role() is null
     or public.admin_role() not in ('super_admin', 'support', 'manager', 'vendor_ops') then
    raise exception 'Reading account emails requires the super admin, support, manager or vendor operations role' using errcode = '42501';
  end if;
  return query
    select p.id,
           case when p.email is null or lower(p.email) like '%.invalid' then null
                else exists (select 1 from auth.users u
                              where u.id = p.id and u.email_confirmed_at is not null
                                and lower(btrim(u.email)) = lower(btrim(p.email)))
           end
      from public.profiles p
     where p.id = any (coalesce(p_ids, '{}'::uuid[]));
end;
$function$;

revoke all on function public.admin_email_verified(uuid[]) from public, anon;
grant execute on function public.admin_email_verified(uuid[]) to authenticated;

do $guard$
begin
  -- The body 20261016120000_support_requester_unverified.sql creates (LF).
  if (select md5(prosrc) from pg_proc where oid = 'public.admin_support_get'::regproc)
     <> '9d259adb1d730e434f3073b74ec53334' then
    raise exception 'guard: admin_support_get() is not the body 20261016120000 created';
  end if;
end
$guard$;

CREATE OR REPLACE FUNCTION public.admin_support_get(p_ticket_no text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                    'has_store', admin.is_real_seller(p.id),
                    'is_staff', exists (select 1 from admin.admin_users a where a.id = p.id and a.is_active),
                    -- A phone sign-in account's address is a placeholder no one reads.
                    'email', case when p.email like '%@phone.cosora.invalid' then null else p.email end,
                    -- Typed on Account Info and never confirmed, unless it is the confirmed sign-in email (2026-11-14).
                    'email_verified', case when p.email is null or lower(p.email) like '%.invalid' then null
                                       else exists (select 1 from auth.users u
                                                     where u.id = p.id and u.email_confirmed_at is not null
                                                       and lower(btrim(u.email)) = lower(btrim(p.email))) end,
                    'phone_masked', admin.support_mask_phone(p.phone),
                    -- Signed up through the test sign-in code (otp-dev-verify), which accepts any 6 digits: the
                    -- number was never verified, so whoever typed it could be anyone (2026-10-16, securityflags).
                    'phone_unverified', coalesce((select u.raw_app_meta_data ->> 'created_by' = 'otp-dev-verify'
                                                    from auth.users u where u.id = p.id), false))
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
