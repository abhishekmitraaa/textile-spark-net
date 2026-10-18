-- A chat file's name is moderated like the message itself (2026-10-18; automated security review of
-- 20261018160000).
--
-- The thread shows a PDF's name (messages.attachment_name), but the blocklist (check_message_blocklist, BEFORE
-- INSERT) and the flag patterns (check_message_flag_patterns, AFTER INSERT) read only messages.body. The app
-- copies the name into the body ("📎 <name>"), but a caller writing to the API directly could send a harmless
-- body and put a phone number or a blocked term in attachment_name, past both.
--
-- Now guard_message_insert() writes the body of a photo / document / voice message itself: "📷 Photo",
-- "📎 <the file's name>" or "🎤 Voice message", with the name trimmed to 200 characters. The flag patterns run
-- AFTER INSERT, so they see that body. The blocklist trigger runs BEFORE this one (trigger order is by name), so
-- the guard checks the name against the blocklist itself, with the same rule and the same message.
--
-- Same function, new body; the pre-check stops the file if production's body isn't 20261018160000's.
-- No DROP and no DELETE.

do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.guard_message_insert()'::regprocedure), chr(13), ''))
     <> '5e6d3fcf9e0cbb86e57d8c30b923f74c' then
    raise exception 'pre-check: public.guard_message_insert() is not the version this migration was written against';
  end if;
end
$pin$;

create or replace function public.guard_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_conv  public.conversations%rowtype;
  v_other uuid;
  v_mime  text;
  v_size  bigint;
begin
  select * into v_conv from public.conversations c where c.id = new.conversation_id;
  if not found then
    return new;  -- the foreign key reports it
  end if;
  v_other := case when v_conv.user_a = new.sender_id then v_conv.user_b else v_conv.user_a end;

  if public.chat_blocked_between(new.sender_id, v_other) then
    raise exception 'chat blocked: messages between these two accounts are blocked' using errcode = '42501';
  end if;

  -- A contact card is written only by share_chat_contact(), which reads the number itself.
  if new.kind = 'contact' and coalesce(current_setting('cosora.chat_contact_share', true), '') <> 'on' then
    raise exception 'contact cards are sent with share_chat_contact()' using errcode = '42501';
  end if;

  if new.kind in ('image', 'file', 'audio') then
    if new.attachment_path is null
       or not public.chat_attachment_path_ok(new.attachment_path)
       or split_part(new.attachment_path, '/', 1) <> new.conversation_id::text
       or split_part(new.attachment_path, '/', 2) <> new.sender_id::text then
      raise exception 'attachment missing or not in this chat' using errcode = '22023';
    end if;
    select o.metadata ->> 'mimetype', nullif(o.metadata ->> 'size', '')::bigint
      into v_mime, v_size
      from storage.objects o
     where o.bucket_id = 'chat-attachments' and o.name = new.attachment_path;
    if not found then
      raise exception 'attachment not uploaded' using errcode = '22023';
    end if;
    if (new.kind = 'image' and coalesce(v_mime, '') not like 'image/%')
       or (new.kind = 'audio' and coalesce(v_mime, '') not like 'audio/%')
       or (new.kind = 'file' and coalesce(v_mime, '') <> 'application/pdf') then
      raise exception 'attachment type does not match the message' using errcode = '22023';
    end if;
    new.attachment_mime  := v_mime;
    new.attachment_bytes := least(coalesce(v_size, 0), 2147483647)::integer;

    -- What the thread shows is what moderation reads (2026-10-18): only a document keeps a name, and its body
    -- is that name. The blocklist trigger has already run on the body the caller sent, so the name is checked
    -- here; the flag patterns run after the insert, on this body.
    if new.kind = 'file' then
      new.attachment_name := nullif(btrim(left(coalesce(new.attachment_name, ''), 200)), '');
      if new.attachment_name is not null and exists (
           select 1 from admin.keyword_blocklist k
            where k.term <> '' and strpos(lower(new.attachment_name), lower(k.term)) > 0) then
        raise exception 'message blocked: contains a restricted term' using errcode = '42501';
      end if;
      new.body := '📎 ' || coalesce(new.attachment_name, 'Document');
    else
      new.attachment_name := null;
      new.body := case new.kind when 'image' then '📷 Photo' else '🎤 Voice message' end;
    end if;
  elsif new.attachment_path is not null then
    raise exception 'only photo, document and voice messages carry a file' using errcode = '22023';
  else
    new.attachment_mime := null;
    new.attachment_bytes := null;
    new.attachment_seconds := null;
    new.attachment_name := null;
  end if;
  return new;
end
$function$;
revoke all on function public.guard_message_insert() from public, anon, authenticated;

do $check$
begin
  if has_function_privilege('authenticated', 'public.guard_message_insert()', 'EXECUTE') then
    raise exception 'self-check: guard_message_insert must not be callable by clients';
  end if;
  if position('keyword_blocklist' in (select p.prosrc from pg_proc p where p.oid = 'public.guard_message_insert()'::regprocedure)) = 0 then
    raise exception 'self-check: the file name is not moderated';
  end if;
end
$check$;
