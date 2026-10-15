-- Reports reach Cosora-Admin, not email; and Cosora-Admin's pictures are JPEG only (Mitra, 2026-10-16:
-- "the report option should get all the reports in the admin panel and not via email"; "all the input
-- pictures from the admin should only accept JPEG").
--
-- 1. REPORTS. A fraud report or app feedback was stored only for accounts the support rollout admits
--    (support_settings.rollout, Off since launch), so everyone else got the email form, and nothing reached
--    Cosora-Admin's Fraud reports board or Support inbox. Now:
--      support_report_fraud, support_submit_feedback   any signed-in account (support_requester(false))
--      support_prepare_upload, support_post_message    the same for a fraud report's or feedback's own ticket
--                                                      (its evidence and follow-ups); other tickets still
--                                                      need the rollout
--    Their bodies are production's (pg_get_functiondef, 2026-10-16) with only those lines changed. Rate
--    limits, validation and the write-only evidence rule are unchanged. Live chat and callbacks keep the gate.
--
-- 2. JPEG. Every picture Cosora-Admin uploads to the `site-content` bucket (banners/, categories/, blog/):
--      the bucket accepts image/jpeg only, and the insert policies (and update's new name) want .jpg/.jpeg.
--    Objects already there (9 blog pictures, PNG and WebP) stay readable and deletable: the select and
--    delete policies are unchanged. Staff support attachments: admin_support_prepare_upload refuses a picture
--    that isn't JPEG (the support bucket is shared with requesters, whose screenshots stay PNG/WebP).
--
-- No DROP of a table or function and no DELETE anywhere in this file.

-- ── 1. Reports ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_report_fraud(p_description text, p_reported_name text DEFAULT NULL::text, p_reported_phone text DEFAULT NULL::text, p_reported_url text DEFAULT NULL::text, p_reported_entity_type text DEFAULT NULL::text, p_reported_entity_id uuid DEFAULT NULL::uuid, p_amount_inr numeric DEFAULT NULL::numeric, p_incident_date date DEFAULT NULL::date, p_city text DEFAULT NULL::text, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := admin.support_requester(false);
  v_lang  text := admin.support_lang(p_language);
  v_body  text := admin.support_body(p_description, true);
  v_phone text := admin.support_phone(p_reported_phone);
  v_name  text := nullif(btrim(coalesce(p_reported_name, '')), '');
  v_url   text := nullif(btrim(coalesce(p_reported_url, '')), '');
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_t     public.support_tickets;
begin
  if char_length(v_name) > 120 or char_length(v_url) > 500 or char_length(v_city) > 80 then
    raise exception 'A field is too long.' using errcode = '22023';
  end if;
  if p_amount_inr is not null and p_amount_inr < 0 then
    raise exception 'The amount can''t be negative.' using errcode = '22023';
  end if;
  if p_incident_date is not null and p_incident_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The date can''t be in the future.' using errcode = '22023';
  end if;
  if (p_reported_entity_type is null) <> (p_reported_entity_id is null) then
    raise exception 'entity type and id go together' using errcode = '22023';
  end if;
  -- Parenthesised: PL/pgSQL ends an IF condition at the first THEN it meets, a CASE's included.
  if p_reported_entity_type is not null and not (case p_reported_entity_type
       when 'vendor' then exists (select 1 from public.vendor_profiles x where x.id = p_reported_entity_id)
       when 'buyer' then exists (select 1 from public.profiles x where x.id = p_reported_entity_id)
       when 'product' then exists (select 1 from public.products x where x.id = p_reported_entity_id)
       when 'ad' then exists (select 1 from public.advertisements x where x.id = p_reported_entity_id)
       when 'conversation' then exists (select 1 from public.conversations c
                                         where c.id = p_reported_entity_id and v_uid in (c.user_a, c.user_b))
       else false end) then
    raise exception 'That item wasn''t found.' using errcode = 'P0002';
  end if;
  if (select count(*) from public.support_tickets t
       where t.requester_id = v_uid and t.channel = 'fraud_report' and t.created_at > now() - interval '1 day') >= 3 then
    raise exception 'You''ve sent 3 reports today. Please wait before sending another.' using errcode = 'P0001', hint = 'rate_limited';
  end if;

  v_t := admin.support_open_ticket(v_uid, 'fraud_report', 'trust_fraud', v_body, v_lang, null, null);
  insert into public.support_fraud_details
    (ticket_id, reported_name, reported_phone, reported_url, reported_entity_type, reported_entity_id,
     amount_inr, incident_date, city)
  values (v_t.id, v_name, v_phone, v_url, p_reported_entity_type, p_reported_entity_id,
          p_amount_inr, p_incident_date, v_city);
  insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_t.id, v_uid, 'requester', v_body);
  perform admin.support_system_message(v_t.id, 'report_received',
    'We''ve recorded your report. Our team reviews every report.', '{}'::jsonb, 'public');
  perform admin.support_notify(v_uid, 'support_receipt', 'Report recorded',
    'We''ve recorded your report ' || v_t.ticket_no || '.');
  return jsonb_build_object('ticket_id', v_t.id, 'ticket_no', v_t.ticket_no);
end
$function$;

CREATE OR REPLACE FUNCTION public.support_submit_feedback(p_kind text, p_body text, p_page text DEFAULT NULL::text, p_language text DEFAULT 'en'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := admin.support_requester(false);
  v_lang text := admin.support_lang(p_language);
  v_body text := admin.support_body(p_body, true);
  v_page text := nullif(left(btrim(coalesce(p_page, '')), 200), '');
  v_t    public.support_tickets;
begin
  if p_kind not in ('bug', 'idea') then
    raise exception 'feedback is a bug or an idea' using errcode = '22023';
  end if;
  if (select count(*) from public.support_tickets t
       where t.requester_id = v_uid and t.channel = 'feedback' and t.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve sent 5 notes today. Thank you! Please send more tomorrow.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  v_t := admin.support_open_ticket(v_uid, 'feedback', 'feedback_' || p_kind, v_body, v_lang, null, null);
  if v_page is not null then
    update public.support_ticket_staff set context = context || jsonb_build_object('page', v_page) where ticket_id = v_t.id;
  end if;
  insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_t.id, v_uid, 'requester', v_body);
  perform admin.support_system_message(v_t.id, 'feedback_received', 'Thanks. The team reads every note.', '{}'::jsonb, 'public');
  perform admin.support_notify(v_uid, 'support_receipt', 'Feedback recorded',
    'We''ve recorded your feedback ' || v_t.ticket_no || '.');
  return jsonb_build_object('ticket_id', v_t.id, 'ticket_no', v_t.ticket_no);
end
$function$;

CREATE OR REPLACE FUNCTION public.support_prepare_upload(p_ticket_id uuid, p_kind text, p_mime text, p_bytes integer, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := admin.support_requester(false);
  v_t   public.support_tickets;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id and t.requester_id = v_uid;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  -- Fraud reports and app feedback are open to every signed-in account (2026-10-16); the rest of support
  -- (chat, callbacks) still follows the rollout.
  if v_t.channel not in ('fraud_report', 'feedback') and not admin.support_rollout_allows() then
    raise exception 'Support chat isn''t available for this account yet.' using errcode = 'P0001', hint = 'support_unavailable';
  end if;
  if v_t.status = 'closed' then
    raise exception 'This request is closed.' using errcode = 'P0001', hint = 'closed';
  end if;
  perform admin.support_rate_check(v_uid, 'upload');
  -- Fraud evidence is write-only for the reporter (plan A4).
  return admin.support_reserve_upload(v_t.id, v_uid, 'requester', p_kind, p_mime, p_bytes, p_duration_ms,
                                      v_t.channel <> 'fraud_report');
end
$function$;

CREATE OR REPLACE FUNCTION public.support_post_message(p_ticket_id uuid, p_body text DEFAULT NULL::text, p_attachment_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := admin.support_requester(false);
  v_body text := admin.support_body(p_body, false);
  v_ids  uuid[] := coalesce(p_attachment_ids, '{}');
  v_t    public.support_tickets;
  v_mid  uuid;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id and t.requester_id = v_uid for update;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  -- Fraud reports and app feedback are open to every signed-in account (2026-10-16); the rest of support
  -- (chat, callbacks) still follows the rollout.
  if v_t.channel not in ('fraud_report', 'feedback') and not admin.support_rollout_allows() then
    raise exception 'Support chat isn''t available for this account yet.' using errcode = 'P0001', hint = 'support_unavailable';
  end if;
  if v_t.status = 'closed' or (v_t.status = 'resolved' and v_t.resolved_at < now() - interval '7 days') then
    raise exception 'This request is closed. Start a new one if you need more help.' using errcode = 'P0001', hint = 'closed';
  end if;
  if v_body is null and cardinality(v_ids) = 0 then
    raise exception 'Write a message or attach a file.' using errcode = '22023';
  end if;
  perform admin.support_rate_check(v_uid, 'message');
  perform admin.support_check_files(v_t.id, v_uid, v_ids);

  if v_t.status = 'resolved' then
    update public.support_tickets set status = 'open', resolved_at = null, reopen_count = reopen_count + 1
     where id = v_t.id;
    insert into public.support_events (ticket_id, actor_id, actor_kind, event, from_status, to_status)
    values (v_t.id, v_uid, 'requester', 'reopened', 'resolved', 'open');
    perform admin.support_system_message(v_t.id, 'reopened', 'You reopened this request.', '{}'::jsonb, 'public');
    v_t.status := 'open';
  end if;
  insert into public.support_messages (ticket_id, author_id, author_kind, kind, body)
  values (v_t.id, v_uid, 'requester', case when v_body is null then 'attachment' else 'text' end, v_body)
  returning id into v_mid;
  update public.support_attachments set message_id = v_mid where id = any (v_ids);
  update public.support_tickets set last_message_at = now(), requester_last_read_at = now() where id = v_t.id;
  return jsonb_build_object('message_id', v_mid, 'status', v_t.status);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_support_prepare_upload(p_ticket_id uuid, p_kind text, p_mime text, p_bytes integer, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t public.support_tickets;
begin
  perform admin.support_require_write();
  -- Pictures from Cosora's team are JPEG only (2026-10-16). Requesters keep PNG and WebP: it's their phone's screenshot.
  if p_mime like 'image/%' and p_mime <> 'image/jpeg' then
    raise exception 'Pictures must be JPEG (.jpg).' using errcode = '22023', hint = 'file_type';
  end if;
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  -- Visible to the requester only once it is sent in a public reply.
  return admin.support_reserve_upload(v_t.id, auth.uid(), 'staff', p_kind, p_mime, p_bytes, p_duration_ms, false);
end
$function$;

-- ── 2. JPEG only for Cosora-Admin's pictures ─────────────────────────────────
update storage.buckets set allowed_mime_types = array['image/jpeg'] where id = 'site-content';

alter policy site_content_admin_insert on storage.objects
  with check (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg)$'
              and (select public.admin_role())::text = 'super_admin');
alter policy site_content_admin_update on storage.objects
  with check (bucket_id = 'site-content' and name ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg)$'
              and (select public.admin_role())::text = 'super_admin');
alter policy site_content_category_insert on storage.objects
  with check (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg)$'
              and (select public.admin_role())::text = any (array['super_admin', 'manager']));
alter policy site_content_category_update on storage.objects
  with check (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg)$'
              and (select public.admin_role())::text = any (array['super_admin', 'manager']));
alter policy blog_media_admin_insert on storage.objects
  with check (bucket_id = 'site-content' and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg)$'
              and (select public.admin_role())::text = 'super_admin');
alter policy blog_media_admin_update on storage.objects
  with check (bucket_id = 'site-content' and name ~ '^blog/[0-9a-f-]{36}\.(jpg|jpeg)$'
              and (select public.admin_role())::text = 'super_admin');

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  f text;
  p record;
begin
  foreach f in array array[
    'public.support_report_fraud(text,text,text,text,text,uuid,numeric,date,text,text)',
    'public.support_submit_feedback(text,text,text,text)',
    'public.support_prepare_upload(uuid,text,text,integer,integer)',
    'public.support_post_message(uuid,text,uuid[])'] loop
    if position('support_requester(false)' in pg_get_functiondef(f::regprocedure)) = 0 then
      raise exception 'self-check: % still needs the rollout', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
       or not (select pr.prosecdef from pg_proc pr where pr.oid = f::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  foreach f in array array['public.support_prepare_upload(uuid,text,text,integer,integer)', 'public.support_post_message(uuid,text,uuid[])'] loop
    if position('admin.support_rollout_allows()' in pg_get_functiondef(f::regprocedure)) = 0 then
      raise exception 'self-check: % lost the rollout gate for other tickets', f;
    end if;
  end loop;
  if position('Pictures must be JPEG' in pg_get_functiondef('public.admin_support_prepare_upload(uuid,text,text,integer,integer)'::regprocedure)) = 0 then
    raise exception 'self-check: staff pictures are not JPEG-only';
  end if;
  if (select allowed_mime_types from storage.buckets where id = 'site-content') is distinct from array['image/jpeg'] then
    raise exception 'self-check: site-content accepts more than JPEG';
  end if;
  for p in select policyname, with_check from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE')
              and coalesce(with_check, '') like '%site-content%' loop
    if p.with_check ~ '(png|webp)' then
      raise exception 'self-check: % still admits PNG or WebP', p.policyname;
    end if;
  end loop;
end
$check$;
