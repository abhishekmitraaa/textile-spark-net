-- Staff see when a requester's phone number was never verified (2026-10-16).
--
-- Fraud reports and feedback are open to every signed-in account since 20261016100000. While the test sign-in
-- code (otp-dev-verify) is on, an account it created was signed in with any 6 digits, so the person behind a
-- report may not own that number (securityflags.md, 2026-10-16, OPEN until SMS delivery exists).
-- admin_support_get() now returns requester.phone_unverified; Cosora-Admin's request page says so on the
-- request. Body is production's (pg_get_functiondef, 2026-10-16) with that one key added.
--
-- No DROP of a table or function and no DELETE anywhere in this file.

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
                    'has_store', exists (select 1 from public.vendor_profiles vp where vp.id = p.id),
                    'is_staff', exists (select 1 from admin.admin_users a where a.id = p.id and a.is_active),
                    -- A phone sign-in account's address is a placeholder no one reads.
                    'email', case when p.email like '%@phone.cosora.invalid' then null else p.email end,
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

do $check$
begin
  if position('phone_unverified' in pg_get_functiondef('public.admin_support_get(text)'::regprocedure)) = 0 then
    raise exception 'self-check: admin_support_get does not report phone_unverified';
  end if;
  if has_function_privilege('anon', 'public.admin_support_get(text)', 'EXECUTE')
     or not (select p.prosecdef from pg_proc p where p.oid = 'public.admin_support_get(text)'::regprocedure) then
    raise exception 'self-check: admin_support_get has the wrong grants or is not SECURITY DEFINER';
  end if;
end
$check$;
