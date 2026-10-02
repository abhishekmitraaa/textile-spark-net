-- Help & Support, phase P2b (documentation/help-feature-plan.md), 2026-09-30.
--
-- What buyers and vendors call. Every function is SECURITY DEFINER with an empty
-- search_path, one overload, EXECUTE for authenticated only (support_status() for anon
-- too), and refuses:
--   * a signed-out caller, and a deleted account;
--   * anyone support isn't rolled out to yet (support_settings.rollout, D-14).
-- It does NOT refuse a suspended account: suspension blocks creating marketplace content,
-- and support is how a suspended user appeals (plan A2 and "Rules every support
-- function keeps").
--
-- Errors carry a machine-readable HINT the app maps to its own words: not_signed_in,
-- account_deleted, support_unavailable, rate_limited, too_many_open, closed,
-- callback_exists, slot_unavailable, file_type, file_size, too_many_files,
-- upload_incomplete, file_unchecked.
--
--   support_status()                 hours, open now, next opening, phone, email, available?
--   support_start_chat(...)          opens a chat, or continues the open one on the same topic
--   support_post_message(...)        a reply, with up to 5 files; reopens a chat resolved < 7 days ago
--   support_prepare_upload(...)      reserves a storage path for one file
--   support_end_chat(id)             the requester ends a chat
--   support_reopen(id)               reopens a chat resolved in the last 7 days
--   support_mark_read(id)            the requester has read the thread
--   support_callback_slots(days)     bookable one-hour callback windows
--   support_request_callback(...)    books one
--   support_report_fraud(...)        a fraud report (evidence goes up afterwards, write-only)
--   support_submit_feedback(...)     a bug report or an idea
--   support_my_requests(limit)       the caller's requests
--   support_request_detail(no)       one request with its public thread
--   support_attachment_checked(...)  service_role only: the signature check's verdict

-- ── Internal helpers (invoker; only the definer functions below call them) ─────
create or replace function admin.support_ist(p_at timestamptz)
returns text language sql stable set search_path = '' as $function$
  select coalesce(to_char(p_at at time zone 'Asia/Kolkata', 'FMDD Mon, HH24:MI') || ' IST', 'the next working day');
$function$;

-- The caller, checked. p_need_rollout is false for what a requester can still do with
-- their own history if support is switched off again (plan section 5, fallback): list
-- and open their requests, mark them read, and end an open chat. Everything that
-- starts a request or adds to one needs rollout.
create or replace function admin.support_requester(p_need_rollout boolean default true)
returns uuid language plpgsql stable set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to contact support.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if not public.account_not_deleted(v_uid) then
    raise exception 'This account has been deleted.' using errcode = '42501', hint = 'account_deleted';
  end if;
  if p_need_rollout and not admin.support_rollout_allows() then
    raise exception 'Support chat isn''t available for this account yet.' using errcode = 'P0001', hint = 'support_unavailable';
  end if;
  return v_uid;
end
$function$;

-- The side the person is on right now: the seller toggle, and a store to back it.
create or replace function admin.support_side_of(p_uid uuid)
returns text language sql stable set search_path = '' as $function$
  select case when p.active_role in ('seller', 'vendor')
                   and exists (select 1 from public.vendor_profiles v where v.id = p_uid)
              then 'vendor' else 'buyer' end
    from public.profiles p where p.id = p_uid;
$function$;

create or replace function admin.support_lang(p text)
returns text language plpgsql immutable set search_path = '' as $function$
begin
  if p is null or btrim(p) = '' then
    return 'en';
  end if;
  if p not in ('en', 'hi', 'gu') then
    raise exception 'unknown language %', p using errcode = '22023';
  end if;
  return p;
end
$function$;

-- Digits with an optional leading +. A bare 10-digit number is Indian (+91).
create or replace function admin.support_phone(p text)
returns text language plpgsql immutable set search_path = '' as $function$
declare
  v text := regexp_replace(coalesce(p, ''), '[\s().-]', '', 'g');
begin
  if v = '' then
    return null;
  end if;
  if v ~ '^[6-9][0-9]{9}$' then
    v := '+91' || v;
  end if;
  if v !~ '^\+?[0-9]{8,15}$' then
    raise exception 'that doesn''t look like a phone number' using errcode = '22023';
  end if;
  return v;
end
$function$;

create or replace function admin.support_body(p text, p_required boolean)
returns text language plpgsql immutable set search_path = '' as $function$
declare
  v text := nullif(btrim(coalesce(p, '')), '');
begin
  if v is null and p_required then
    raise exception 'Write a message.' using errcode = '22023';
  end if;
  if char_length(v) > 4000 then
    raise exception 'A message can be at most 4,000 characters.' using errcode = '22023';
  end if;
  return v;
end
$function$;

create or replace function admin.support_rate_check(p_uid uuid, p_what text)
returns void language plpgsql stable set search_path = '' as $function$
begin
  if p_what = 'ticket' then
    if (select count(*) from public.support_tickets t
         where t.requester_id = p_uid and t.created_at > now() - interval '1 hour') >= 5
       or (select count(*) from public.support_tickets t
            where t.requester_id = p_uid and t.created_at > now() - interval '1 day') >= 20 then
      raise exception 'Too many requests. Please wait a while and try again.' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    if (select count(*) from public.support_tickets t
         where t.requester_id = p_uid and t.status in ('new', 'open')) >= 5 then
      raise exception 'You already have 5 open requests.' using errcode = 'P0001', hint = 'too_many_open';
    end if;
  elsif p_what = 'message' then
    if (select count(*) from public.support_messages m
         where m.author_id = p_uid and m.author_kind = 'requester'
           and m.created_at > now() - interval '5 minutes') >= 30 then
      raise exception 'Too many messages. Please wait a few minutes.' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  elsif p_what = 'upload' then
    if (select count(*) from public.support_attachments a
         where a.uploader_id = p_uid and a.created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Too many files. Please wait a while.' using errcode = 'P0001', hint = 'rate_limited';
    end if;
  else
    raise exception 'unknown rate check %', p_what using errcode = '22023';
  end if;
end
$function$;

-- The item a request is about must exist, and a private one must be the caller's.
create or replace function admin.support_check_entity(p_uid uuid, p_type text, p_id uuid)
returns void language plpgsql stable set search_path = '' as $function$
declare
  v_ok boolean;
begin
  if p_type is null and p_id is null then
    return;
  end if;
  if p_type is null or p_id is null then
    raise exception 'entity type and id go together' using errcode = '22023';
  end if;
  v_ok := case p_type
    when 'conversation' then exists (select 1 from public.conversations c where c.id = p_id and p_uid in (c.user_a, c.user_b))
    when 'rfq' then exists (select 1 from public.rfqs r where r.id = p_id
                             and (r.buyer_id = p_uid or r.vendor_id = p_uid or r.vendor_id is null
                                  or exists (select 1 from public.quotes q where q.rfq_id = r.id and q.vendor_id = p_uid)))
    when 'quote' then exists (select 1 from public.quotes q join public.rfqs r on r.id = q.rfq_id
                               where q.id = p_id and (q.vendor_id = p_uid or r.buyer_id = p_uid))
    when 'product' then exists (select 1 from public.products x where x.id = p_id)
    when 'video' then exists (select 1 from public.product_videos x where x.id = p_id)
    when 'vendor' then exists (select 1 from public.vendor_profiles x where x.id = p_id)
    when 'ad' then exists (select 1 from public.advertisements x where x.id = p_id and x.vendor_id = p_uid)
    when 'invoice' then exists (select 1 from public.subscription_invoices x where x.id = p_id and x.vendor_id = p_uid)
    when 'kyc' then exists (select 1 from public.vendor_documents x where x.id = p_id and x.vendor_id = p_uid)
    when 'certificate_order' then exists (select 1 from public.certificate_orders x where x.id = p_id and x.vendor_id = p_uid)
    when 'review' then exists (select 1 from public.reviews x where x.id = p_id)
                       or exists (select 1 from public.product_reviews x where x.id = p_id)
    when 'account' then p_id = p_uid
    else false
  end;
  if not coalesce(v_ok, false) then
    raise exception 'That item wasn''t found, or isn''t yours.' using errcode = 'P0002';
  end if;
end
$function$;

-- What staff see beside the thread. Facts from the database, never from the requester.
create or replace function admin.support_context(p_uid uuid, p_side text, p_entity_type text, p_entity_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $function$
declare
  v        jsonb;
  v_entity jsonb;
  v_plan   jsonb;
  v_kyc    jsonb;
begin
  select jsonb_build_object('account_status', p.account_status::text, 'joined_at', p.created_at, 'side', p_side,
                            'has_store', exists (select 1 from public.vendor_profiles vp where vp.id = p_uid))
    into v from public.profiles p where p.id = p_uid;
  if exists (select 1 from public.vendor_profiles vp where vp.id = p_uid) then
    select jsonb_build_object('plan_id', s.plan_id, 'status', s.status, 'period_end', s.current_period_end)
      into v_plan
      from public.vendor_subscriptions s where s.vendor_id = p_uid order by s.created_at desc limit 1;
    select jsonb_build_object('submitted', count(*),
                              'verified', count(*) filter (where d.verified),
                              'rejected', count(*) filter (where d.rejection_reason is not null and not coalesce(d.verified, false)),
                              'last_submitted_at', max(d.created_at))
      into v_kyc from public.vendor_documents d where d.vendor_id = p_uid;
    v := v || jsonb_build_object('vendor', jsonb_build_object(
           'brand_name', (select vp.brand_name from public.vendor_profiles vp where vp.id = p_uid),
           'is_verified', (select vp.is_verified from public.vendor_profiles vp where vp.id = p_uid),
           'plan', v_plan, 'kyc', v_kyc));
  end if;
  if p_entity_type = 'conversation' then
    select jsonb_build_object(
             'conversation_status', c.status,
             'other_party_id', case when c.user_a = p_uid then c.user_b else c.user_a end,
             'last_message_by_other_at', (select max(m.created_at) from public.messages m
                                           where m.conversation_id = c.id and m.sender_id <> p_uid),
             'last_message_by_requester_at', (select max(m.created_at) from public.messages m
                                               where m.conversation_id = c.id and m.sender_id = p_uid))
      into v_entity from public.conversations c where c.id = p_entity_id;
  elsif p_entity_type = 'rfq' then
    select jsonb_build_object('rfq_status', r.status, 'title', r.title, 'created_at', r.created_at,
                              'quotes', (select count(*) from public.quotes q where q.rfq_id = r.id))
      into v_entity from public.rfqs r where r.id = p_entity_id;
  elsif p_entity_type = 'quote' then
    select jsonb_build_object('quote_status', q.status, 'rfq_id', q.rfq_id, 'vendor_id', q.vendor_id, 'created_at', q.created_at)
      into v_entity from public.quotes q where q.id = p_entity_id;
  end if;
  if v_entity is not null then
    v := v || jsonb_build_object('entity', v_entity);
  end if;
  return coalesce(v, '{}'::jsonb);
end
$function$;

-- A ticket, its staff row and its first event. The caller has passed support_requester().
create or replace function admin.support_open_ticket(
  p_uid uuid, p_channel text, p_category text, p_subject text, p_language text,
  p_entity_type text, p_entity_id uuid)
returns public.support_tickets language plpgsql volatile set search_path = '' as $function$
declare
  v_side text := admin.support_side_of(p_uid);
  v_cat  public.support_categories;
  v_t    public.support_tickets;
begin
  select * into v_cat from public.support_categories c where c.code = p_category;
  if not found or not v_cat.active or not (p_channel = any (v_cat.channels)) then
    raise exception 'Unknown or unavailable topic: %', p_category using errcode = '22023';
  end if;
  if v_cat.audience <> 'both' and v_cat.audience <> v_side then
    raise exception 'That topic is for % accounts.', v_cat.audience using errcode = '22023';
  end if;
  perform admin.support_check_entity(p_uid, p_entity_type, p_entity_id);
  perform admin.support_rate_check(p_uid, 'ticket');

  insert into public.support_tickets
    (requester_id, requester_side, channel, category, subject, language, entity_type, entity_id, restricted, is_test)
  values
    (p_uid, v_side, p_channel, p_category, left(regexp_replace(btrim(p_subject), '\s+', ' ', 'g'), 140), p_language,
     p_entity_type, p_entity_id, v_cat.restricted,
     p_uid = any (coalesce((select s.test_profile_ids from public.support_settings s where s.singleton), '{}')))
  returning * into v_t;

  insert into public.support_ticket_staff (ticket_id, context)
  values (v_t.id, admin.support_context(p_uid, v_side, p_entity_type, p_entity_id));
  insert into public.support_events (ticket_id, actor_id, actor_kind, event, to_status)
  values (v_t.id, p_uid, 'requester', 'opened', 'new');
  return v_t;
end
$function$;

-- A system line in the thread. p_event is the code the app translates; p_body is the
-- English the Admin panel shows and the app falls back to.
create or replace function admin.support_system_message(
  p_ticket_id uuid, p_event text, p_body text, p_meta jsonb, p_visibility text)
returns void language sql volatile set search_path = '' as $function$
  insert into public.support_messages (ticket_id, author_kind, visibility, kind, body, event, meta)
  values (p_ticket_id, 'system', p_visibility, 'event', p_body, p_event, coalesce(p_meta, '{}'::jsonb));
$function$;

-- Reserve one storage path. Shared by requester and staff uploads.
create or replace function admin.support_reserve_upload(
  p_ticket_id uuid, p_uid uuid, p_uploader_kind text, p_kind text, p_mime text, p_bytes int,
  p_duration_ms int, p_requester_can_view boolean)
returns jsonb language plpgsql volatile set search_path = '' as $function$
declare
  v_ext  text;
  v_kind text;
  v_cap  int;
  v_id   uuid := gen_random_uuid();
  v_path text;
begin
  v_ext := case p_mime
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
    when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg' when 'audio/mp4' then 'm4a'
    when 'audio/x-m4a' then 'm4a' when 'audio/aac' then 'aac' when 'audio/mpeg' then 'mp3'
    when 'audio/wav' then 'wav'
  end;
  if v_ext is null then
    raise exception 'That file type isn''t accepted. Send a photo (JPG, PNG, WebP), a PDF or a voice note.'
      using errcode = '22023', hint = 'file_type';
  end if;
  v_kind := case when p_mime like 'image/%' then 'image' when p_mime = 'application/pdf' then 'pdf' else 'audio' end;
  if p_kind is distinct from v_kind then
    raise exception 'the file kind and type disagree' using errcode = '22023', hint = 'file_type';
  end if;
  v_cap := case v_kind when 'pdf' then 10485760 else 5242880 end;
  if p_bytes is null or p_bytes <= 0 or p_bytes > v_cap then
    raise exception 'That file is too large. The limit is % MB.', v_cap / 1048576 using errcode = '22023', hint = 'file_size';
  end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 600000) then
    raise exception 'a voice note is at most 10 minutes' using errcode = '22023';
  end if;
  -- Rejected files are already deleted from storage and can never be sent, so they
  -- don't count. Unsent reservations still do, which keeps the cap a real bound.
  if (select count(*) from public.support_attachments a
       where a.ticket_id = p_ticket_id and a.status <> 'rejected') >= 30 then
    raise exception 'This request already has 30 files.' using errcode = 'P0001', hint = 'too_many_files';
  end if;
  v_path := p_ticket_id::text || '/' || v_id::text || '.' || v_ext;
  insert into public.support_attachments
    (id, ticket_id, uploader_id, uploader_kind, kind, mime, bytes, duration_ms, storage_path, requester_can_view)
  values (v_id, p_ticket_id, p_uid, p_uploader_kind, v_kind, p_mime, p_bytes, p_duration_ms, v_path, p_requester_can_view);
  return jsonb_build_object('attachment_id', v_id, 'bucket', 'support-attachments', 'path', v_path);
end
$function$;

-- Files named for a message must be the uploader's, on this ticket, unsent and uploaded.
create or replace function admin.support_check_files(p_ticket_id uuid, p_uid uuid, p_ids uuid[])
returns void language plpgsql stable set search_path = '' as $function$
begin
  if cardinality(p_ids) > 5 then
    raise exception 'At most 5 files per message.' using errcode = '22023', hint = 'too_many_files';
  end if;
  if cardinality(p_ids) = 0 then
    return;
  end if;
  if (select count(distinct a.id) from public.support_attachments a
       where a.id = any (p_ids) and a.ticket_id = p_ticket_id and a.uploader_id = p_uid
         and a.message_id is null and a.status <> 'rejected') <> cardinality(p_ids) then
    raise exception 'A file is missing, was rejected or was already sent.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.support_attachments a
              where a.id = any (p_ids)
                and not exists (select 1 from storage.objects o
                                 where o.bucket_id = 'support-attachments' and o.name = a.storage_path)) then
    raise exception 'A file hasn''t finished uploading.' using errcode = 'P0001', hint = 'upload_incomplete';
  end if;
  -- Only checked files go out. A file whose check never ran would otherwise sit on the
  -- message as "Checking the file…" for good, because only its uploader can run the check.
  -- The uploader's client runs support-attachment-verify again and resends.
  if exists (select 1 from public.support_attachments a where a.id = any (p_ids) and a.status <> 'clean') then
    raise exception 'A file is still being checked.' using errcode = 'P0001', hint = 'file_unchecked';
  end if;
end
$function$;

-- ── Requester functions ────────────────────────────────────────────────────────
create or replace function public.support_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  s     public.support_settings;
  v_now timestamptz := now();
begin
  select * into s from public.support_settings where singleton;
  return jsonb_build_object(
    'available',    admin.support_rollout_allows(),
    'open_now',     admin.support_is_open_at(v_now),
    'next_open_at', admin.support_next_open_at(v_now),
    'timezone',     'Asia/Kolkata',
    'phone',        s.support_phone,
    'email',        s.support_email,
    'hours',        (select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'is_open', h.is_open,
                                                         'open', to_char(h.open_time, 'HH24:MI'),
                                                         'close', to_char(h.close_time, 'HH24:MI'))
                              order by h.weekday)
                       from public.support_hours h),
    'holidays',     (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'label', d.label) order by d.day), '[]'::jsonb)
                       from public.support_holidays d
                      where d.day between (v_now at time zone 'Asia/Kolkata')::date
                                      and (v_now at time zone 'Asia/Kolkata')::date + 60));
end
$function$;

create or replace function public.support_start_chat(
  p_category text, p_body text, p_language text default 'en',
  p_entity_type text default null, p_entity_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid  uuid := admin.support_requester(true);
  v_lang text := admin.support_lang(p_language);
  v_body text := admin.support_body(p_body, true);
  v_open boolean := admin.support_is_open_at(now());
  v_next timestamptz := admin.support_next_open_at(now());
  v_t    public.support_tickets;
begin
  -- One open chat per topic and item: starting again continues it.
  select * into v_t from public.support_tickets t
   where t.requester_id = v_uid and t.channel = 'chat' and t.category = p_category
     and t.status in ('new', 'open')
     and t.entity_type is not distinct from p_entity_type and t.entity_id is not distinct from p_entity_id
   order by t.created_at desc limit 1
   for update;
  if found then
    perform admin.support_rate_check(v_uid, 'message');
    insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_t.id, v_uid, 'requester', v_body);
    update public.support_tickets set last_message_at = now() where id = v_t.id;
    return jsonb_build_object('ticket_id', v_t.id, 'ticket_no', v_t.ticket_no, 'continued', true,
                              'open_now', v_open, 'next_open_at', v_next);
  end if;
  if (select count(*) from public.support_tickets t
       where t.requester_id = v_uid and t.channel = 'chat' and t.status in ('new', 'open')) >= 3 then
    raise exception 'You already have 3 open chats.' using errcode = 'P0001', hint = 'too_many_open';
  end if;

  v_t := admin.support_open_ticket(v_uid, 'chat', p_category, v_body, v_lang, p_entity_type, p_entity_id);
  insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_t.id, v_uid, 'requester', v_body);
  perform admin.support_system_message(
    v_t.id,
    case when v_open then 'received' else 'received_offline' end,
    case when v_open then 'Thanks. Cosora Support will reply here.'
         else 'We''re offline now. Cosora Support replies from ' || admin.support_ist(v_next) || '.' end,
    jsonb_build_object('next_open_at', v_next), 'public');
  return jsonb_build_object('ticket_id', v_t.id, 'ticket_no', v_t.ticket_no, 'continued', false,
                            'open_now', v_open, 'next_open_at', v_next);
end
$function$;

create or replace function public.support_post_message(
  p_ticket_id uuid, p_body text default null, p_attachment_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid  uuid := admin.support_requester(true);
  v_body text := admin.support_body(p_body, false);
  v_ids  uuid[] := coalesce(p_attachment_ids, '{}');
  v_t    public.support_tickets;
  v_mid  uuid;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id and t.requester_id = v_uid for update;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
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

create or replace function public.support_prepare_upload(
  p_ticket_id uuid, p_kind text, p_mime text, p_bytes int, p_duration_ms int default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid uuid := admin.support_requester(true);
  v_t   public.support_tickets;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id and t.requester_id = v_uid;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
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

create or replace function public.support_end_chat(p_ticket_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid uuid := admin.support_requester(false);
  v_t   public.support_tickets;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id and t.requester_id = v_uid for update;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  if v_t.status not in ('new', 'open') then
    return jsonb_build_object('status', v_t.status);
  end if;
  update public.support_tickets set status = 'resolved', resolved_at = now() where id = v_t.id;
  insert into public.support_events (ticket_id, actor_id, actor_kind, event, from_status, to_status)
  values (v_t.id, v_uid, 'requester', 'ended_by_requester', v_t.status, 'resolved');
  perform admin.support_system_message(v_t.id, 'ended',
    'You ended this chat. Reply within 7 days to reopen it.', '{}'::jsonb, 'public');
  return jsonb_build_object('status', 'resolved');
end
$function$;

create or replace function public.support_reopen(p_ticket_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid uuid := admin.support_requester(true);
  v_t   public.support_tickets;
begin
  select * into v_t from public.support_tickets t where t.id = p_ticket_id and t.requester_id = v_uid for update;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  if v_t.status in ('new', 'open') then
    return jsonb_build_object('status', v_t.status);
  end if;
  if v_t.status = 'closed' or v_t.resolved_at < now() - interval '7 days' then
    raise exception 'This request is closed. Start a new one if you need more help.' using errcode = 'P0001', hint = 'closed';
  end if;
  update public.support_tickets set status = 'open', resolved_at = null, reopen_count = reopen_count + 1 where id = v_t.id;
  insert into public.support_events (ticket_id, actor_id, actor_kind, event, from_status, to_status)
  values (v_t.id, v_uid, 'requester', 'reopened', 'resolved', 'open');
  perform admin.support_system_message(v_t.id, 'reopened', 'You reopened this request.', '{}'::jsonb, 'public');
  return jsonb_build_object('status', 'open');
end
$function$;

create or replace function public.support_mark_read(p_ticket_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid uuid := admin.support_requester(false);
begin
  update public.support_tickets set requester_last_read_at = now()
   where id = p_ticket_id and requester_id = v_uid;
end
$function$;

-- One-hour windows inside opening hours, starting at least 30 minutes from now.
create or replace function public.support_callback_slots(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_days  int := least(greatest(coalesce(p_days, 7), 1), 14);
  v_out   jsonb := '[]'::jsonb;
  v_day   date;
  h       record;
  v_start time;
begin
  perform admin.support_requester(true);
  for i in 0..v_days loop
    v_day := v_today + i;
    select * into h from public.support_hours s where s.weekday = extract(dow from v_day)::int;
    continue when not found;
    continue when not h.is_open or exists (select 1 from public.support_holidays d where d.day = v_day);
    v_start := h.open_time;
    while v_start + interval '1 hour' <= h.close_time loop
      -- A time wraps at midnight: 23:30 + 1 hour is 00:30. Stop rather than loop.
      exit when v_start + interval '1 hour' < v_start;
      if ((v_day + v_start) at time zone 'Asia/Kolkata') > now() + interval '30 minutes' then
        v_out := v_out || jsonb_build_object('date', v_day, 'start', to_char(v_start, 'HH24:MI'),
                                             'end', to_char(v_start + interval '1 hour', 'HH24:MI'));
      end if;
      v_start := v_start + interval '1 hour';
    end loop;
  end loop;
  return v_out;
end
$function$;

create or replace function public.support_request_callback(
  p_category text, p_phone text, p_date date, p_window_start time,
  p_note text default null, p_language text default 'en')
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid   uuid := admin.support_requester(true);
  v_lang  text := admin.support_lang(p_language);
  v_phone text := admin.support_phone(p_phone);
  v_note  text := admin.support_body(p_note, false);
  v_end   time := p_window_start + interval '1 hour';
  v_label text;
  v_t     public.support_tickets;
begin
  if v_phone is null then
    raise exception 'Give the number we should call.' using errcode = '22023';
  end if;
  if p_date is null or p_window_start is null
     or not exists (select 1 from jsonb_array_elements(public.support_callback_slots(14)) as s(slot)
                     where (s.slot ->> 'date')::date = p_date and s.slot ->> 'start' = to_char(p_window_start, 'HH24:MI')) then
    raise exception 'That time isn''t available. Pick a slot inside support hours.' using errcode = 'P0001', hint = 'slot_unavailable';
  end if;
  if exists (select 1 from public.support_tickets t join public.support_callbacks c on c.ticket_id = t.id
              where t.requester_id = v_uid and t.status in ('new', 'open') and c.outcome = 'pending') then
    raise exception 'You already have a callback booked.' using errcode = 'P0001', hint = 'callback_exists';
  end if;

  v_label := to_char(p_date, 'FMDD Mon') || ', ' || to_char(p_window_start, 'HH24:MI') || '-' || to_char(v_end, 'HH24:MI') || ' IST';
  v_t := admin.support_open_ticket(v_uid, 'callback', p_category, 'Callback on ' || v_label, v_lang, null, null);
  insert into public.support_callbacks (ticket_id, phone, preferred_date, window_start, window_end)
  values (v_t.id, v_phone, p_date, p_window_start, v_end);
  if v_note is not null then
    insert into public.support_messages (ticket_id, author_id, author_kind, body) values (v_t.id, v_uid, 'requester', v_note);
  end if;
  perform admin.support_system_message(v_t.id, 'callback_requested',
    'Callback requested for ' || v_label || '.',
    jsonb_build_object('date', p_date, 'start', to_char(p_window_start, 'HH24:MI'), 'end', to_char(v_end, 'HH24:MI')),
    'public');
  perform admin.support_notify(v_uid, 'support_callback', 'Callback booked',
    'Request ' || v_t.ticket_no || ': we''ll call you on ' || v_label || '.');
  return jsonb_build_object('ticket_id', v_t.id, 'ticket_no', v_t.ticket_no,
                            'date', p_date, 'start', to_char(p_window_start, 'HH24:MI'), 'end', to_char(v_end, 'HH24:MI'));
end
$function$;

create or replace function public.support_report_fraud(
  p_description text,
  p_reported_name text default null, p_reported_phone text default null, p_reported_url text default null,
  p_reported_entity_type text default null, p_reported_entity_id uuid default null,
  p_amount_inr numeric default null, p_incident_date date default null, p_city text default null,
  p_language text default 'en')
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid   uuid := admin.support_requester(true);
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

create or replace function public.support_submit_feedback(
  p_kind text, p_body text, p_page text default null, p_language text default 'en')
returns jsonb language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid  uuid := admin.support_requester(true);
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

create or replace function public.support_my_requests(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := admin.support_requester(false);
begin
  return coalesce((
    select jsonb_agg(r order by r.last_message_at desc)
      from (select t.id, t.ticket_no, t.channel, t.category, c.label as category_label, t.status, t.subject,
                   t.created_at, t.last_message_at, t.resolved_at,
                   exists (select 1 from public.support_messages m
                            where m.ticket_id = t.id and m.visibility = 'public' and m.author_kind in ('staff', 'system')
                              and m.created_at > coalesce(t.requester_last_read_at, t.created_at)) as unread,
                   (select jsonb_build_object('date', cb.preferred_date, 'start', to_char(cb.window_start, 'HH24:MI'),
                                              'end', to_char(cb.window_end, 'HH24:MI'), 'outcome', cb.outcome)
                      from public.support_callbacks cb where cb.ticket_id = t.id) as callback
              from public.support_tickets t
              join public.support_categories c on c.code = t.category
             where t.requester_id = v_uid
             order by t.last_message_at desc
             limit least(greatest(coalesce(p_limit, 50), 1), 100)) r), '[]'::jsonb);
end
$function$;

create or replace function public.support_request_detail(p_ticket_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_uid uuid := admin.support_requester(false);
  v_t   public.support_tickets;
begin
  select * into v_t from public.support_tickets t where t.ticket_no = p_ticket_no and t.requester_id = v_uid;
  if not found then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', v_t.id, 'ticket_no', v_t.ticket_no, 'channel', v_t.channel, 'category', v_t.category,
      'category_label', (select c.label from public.support_categories c where c.code = v_t.category),
      'status', v_t.status, 'subject', v_t.subject, 'language', v_t.language,
      'entity_type', v_t.entity_type, 'entity_id', v_t.entity_id,
      'created_at', v_t.created_at, 'last_message_at', v_t.last_message_at, 'resolved_at', v_t.resolved_at,
      'closed_at', v_t.closed_at,
      'can_reply', v_t.status in ('new', 'open')
                   or (v_t.status = 'resolved' and v_t.resolved_at >= now() - interval '7 days')),
    'callback', (select jsonb_build_object('date', cb.preferred_date, 'start', to_char(cb.window_start, 'HH24:MI'),
                                           'end', to_char(cb.window_end, 'HH24:MI'), 'outcome', cb.outcome)
                   from public.support_callbacks cb where cb.ticket_id = v_t.id),
    -- Evidence the reporter sent, counted, not listed (plan A4).
    'files_received', (select count(*) from public.support_attachments a
                        where a.ticket_id = v_t.id and a.uploader_kind = 'requester' and a.message_id is not null),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', m.id, 'author_kind', m.author_kind, 'kind', m.kind, 'body', m.body,
                           'event', m.event, 'meta', m.meta, 'created_at', m.created_at,
                           'mine', m.author_id = v_uid) order by m.created_at, m.id)
                            from public.support_messages m
                           where m.ticket_id = v_t.id and m.visibility = 'public'), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object(
                              'id', a.id, 'message_id', a.message_id, 'kind', a.kind, 'mime', a.mime, 'bytes', a.bytes,
                              'duration_ms', a.duration_ms, 'path', a.storage_path) order by a.created_at)
                               from public.support_attachments a
                              where a.ticket_id = v_t.id and a.requester_can_view and a.status = 'clean'
                                and a.message_id is not null), '[]'::jsonb));
end
$function$;

-- The signature check's verdict, from the support-attachment-verify edge function.
create or replace function public.support_attachment_checked(p_attachment_id uuid, p_clean boolean)
returns void language plpgsql volatile security definer set search_path = '' as $function$
begin
  update public.support_attachments
     set status = case when p_clean then 'clean' else 'rejected' end, checked_at = now()
   where id = p_attachment_id and status = 'pending';
end
$function$;

-- ── Grants ─────────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'admin.support_ist(timestamptz)', 'admin.support_requester(boolean)', 'admin.support_side_of(uuid)',
    'admin.support_lang(text)', 'admin.support_phone(text)', 'admin.support_body(text, boolean)',
    'admin.support_rate_check(uuid, text)', 'admin.support_check_entity(uuid, text, uuid)',
    'admin.support_context(uuid, text, text, uuid)',
    'admin.support_open_ticket(uuid, text, text, text, text, text, uuid)',
    'admin.support_system_message(uuid, text, text, jsonb, text)',
    'admin.support_reserve_upload(uuid, uuid, text, text, text, integer, integer, boolean)',
    'admin.support_check_files(uuid, uuid, uuid[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.support_status()',
    'public.support_start_chat(text, text, text, text, uuid)',
    'public.support_post_message(uuid, text, uuid[])',
    'public.support_prepare_upload(uuid, text, text, integer, integer)',
    'public.support_end_chat(uuid)', 'public.support_reopen(uuid)', 'public.support_mark_read(uuid)',
    'public.support_callback_slots(integer)',
    'public.support_request_callback(text, text, date, time, text, text)',
    'public.support_report_fraud(text, text, text, text, text, uuid, numeric, date, text, text)',
    'public.support_submit_feedback(text, text, text, text)',
    'public.support_my_requests(integer)', 'public.support_request_detail(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  grant execute on function public.support_status() to anon;
  revoke all on function public.support_attachment_checked(uuid, boolean) from public, anon, authenticated;
  grant execute on function public.support_attachment_checked(uuid, boolean) to service_role;
end
$grants$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.support_start_chat(text, text, text, text, uuid)', 'public.support_post_message(uuid, text, uuid[])',
    'public.support_prepare_upload(uuid, text, text, integer, integer)', 'public.support_end_chat(uuid)',
    'public.support_reopen(uuid)', 'public.support_mark_read(uuid)', 'public.support_callback_slots(integer)',
    'public.support_request_callback(text, text, date, time, text, text)',
    'public.support_report_fraud(text, text, text, text, text, uuid, numeric, date, text, text)',
    'public.support_submit_feedback(text, text, text, text)', 'public.support_my_requests(integer)',
    'public.support_request_detail(text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: grants on % are wrong', f;
    end if;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER with an empty search_path', f;
    end if;
  end loop;
  if not has_function_privilege('anon', 'public.support_status()', 'EXECUTE') then
    raise exception 'self-check: support_status() must be public';
  end if;
  if has_function_privilege('authenticated', 'public.support_attachment_checked(uuid, boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.support_attachment_checked(uuid, boolean)', 'EXECUTE') then
    raise exception 'self-check: support_attachment_checked is for service_role only';
  end if;
  -- One overload each.
  if exists (select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'support\_%' group by p.proname having count(*) > 1) then
    raise exception 'self-check: a support function has more than one overload';
  end if;
end
$check$;
