-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 09 — Phase 4c: messaging, moderation actions
-- and the FK web, after keyword_blocklist / flag_patterns / chat_block_reasons /
-- conversation_reviews / account_suspensions moved into `admin`.
--
-- The buyer/vendor chat path runs through two SECURITY DEFINER triggers on
-- public.messages that now read and write admin.* — this proves they still do,
-- through the real path (a signed-in buyer inserting into public.messages under
-- RLS), not by calling the functions directly.
--
--   M1 blocklisted term  → the insert is HARD-REJECTED (42501) by
--                          check_message_blocklist reading admin.keyword_blocklist
--                          (a temp term is added first). Control M1c: the same body
--                          without the temp term sends — so the rejection is the
--                          admin row, not something else about the message.
--   M2 flag-pattern hit  → the message sends AND check_message_flag_patterns writes
--                          one pending regex_flag row to admin.conversation_reviews
--                          and locks the conversation (under_review), notifying both.
--   M3 buyer report      → submit_report writes a pending user_report row to
--                          admin.conversation_reviews and locks the conversation.
--   M4 clean message     → sends, no review row, conversation stays active.
--   A1 resolve (super_admin) → resolve_conversation_review closes a pending review in
--                          admin.conversation_reviews (status, reviewed_by) and resumes the chat.
--   A2 suspend + reinstate (super_admin) → set_account_status writes an active row to
--                          admin.account_suspensions, then closes it; profile flag follows.
--   D1 buyer resolves    → 42501.   D2 buyer suspends → refused (P0001, pre-existing).
--   D3 report on a conversation the caller is not in → refused.
--   F1 flagged message deleted → review.flagged_message_id SET NULL (FK public→admin side).
--   F2 conversation deleted    → its reviews CASCADE-deleted.
--   F3 suspension for a non-existent profile        → 23503 (cross-schema FK).
--   F4 review naming a non-existent flag pattern    → 23503 (intra-admin FK).
--   F5 deleting a chat_block_reason still referenced → 23503 (intra-admin FK).
--
-- Personas: demo-buyer 11111111-… and demo-vendor 22222222-… (the two members of the
-- fixture conversation); demo-admin 33333333-… (super_admin).
-- Expected: every line PASS; the header line reports the fixture.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p4c$
declare
  sa uuid := '33333333-3333-3333-3333-333333333333';
  bu uuid := '11111111-1111-1111-1111-111111111111';
  ve uuid := '22222222-2222-2222-2222-222222222222';
  conv uuid;
  cases text[] := array['M1 blocklisted term rejected', 'M1c control: same body without the term sends',
                        'M2 flag pattern writes admin review', 'M3 buyer report writes admin review',
                        'M4 clean message sends', 'A1 super_admin resolves review', 'A2 super_admin suspends + reinstates',
                        'D1 buyer resolve refused', 'D2 buyer suspend refused', 'D3 report on foreign conversation refused',
                        'F1 message delete -> SET NULL', 'F2 conversation delete -> CASCADE', 'F3 FK profile_id enforced',
                        'F4 FK matched_pattern_id enforced', 'F5 FK reason_id restrict'];
  i int; v_msg uuid; v_rev uuid; v_n bigint; v_m bigint; v_s text; r text; out text := ''; fails int := 0;
  v_reason uuid;
begin
  select c.id into conv from public.conversations c
   where bu in (c.user_a, c.user_b) and ve in (c.user_a, c.user_b) and c.status = 'active'
   order by c.created_at, c.id limit 1;
  select id into v_reason from admin.chat_block_reasons where active order by created_at, id limit 1;
  if conv is null or v_reason is null
     or (select account_status from public.profiles where id = bu) <> 'active'
     or (select account_status from public.profiles where id = ve) <> 'active' then
    raise exception 'P4C fixture missing: an ACTIVE demo-buyer/demo-vendor conversation with both accounts active (conv=%, reason=%)', conv, v_reason;
  end if;
  out := 'fixture conv=' || left(conv::text, 8) || ' tables: ' ||
         (select string_agg(c.relnamespace::regnamespace || '.' || c.relname, ',' order by c.relname) from pg_class c
           where c.relkind = 'r' and c.relname in ('keyword_blocklist','flag_patterns','chat_block_reasons','conversation_reviews','account_suspensions')) || E'\n';

  for i in 1..array_length(cases, 1) loop
    begin
      r := null;
      if i in (1, 2, 3, 4, 5) then
        -- as the buyer, through RLS
        if i = 1 then insert into admin.keyword_blocklist (term, added_by) values ('zz4c-restricted', sa); end if;
        perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', bu::text, true);
        set local role authenticated;
        begin
          if i in (1, 2) then
            insert into public.messages (conversation_id, sender_id, body) values (conv, bu, 'hello zz4c-restricted there') returning id into v_msg;
          elsif i = 3 then
            insert into public.messages (conversation_id, sender_id, body) values (conv, bu, 'zz4c ping me on whatsapp please') returning id into v_msg;
          elsif i = 4 then
            perform public.submit_report(conv, null, 'zz4c report');
          else
            insert into public.messages (conversation_id, sender_id, body) values (conv, bu, 'zz4c is the cotton twill still available?') returning id into v_msg;
          end if;
          r := 'OK';
        exception when others then r := 'ERR ' || sqlstate || ' ' || left(sqlerrm, 60);
        end;
        reset role;
        if i = 1 then
          r := case when r like 'ERR 42501 message blocked%' and not exists (select 1 from public.messages where body = 'hello zz4c-restricted there')
                    then 'PASS (' || r || ')' else 'FAIL (' || r || ')' end;
        elsif i = 2 then
          r := case when r = 'OK' then 'PASS (sent without the admin term)' else 'FAIL (' || r || ')' end;
        elsif i = 3 then
          select count(*) into v_n from admin.conversation_reviews where flagged_message_id = v_msg and source = 'regex_flag' and status = 'pending' and matched_pattern_id is not null;
          select status into v_s from public.conversations where id = conv;
          select count(*) into v_m from public.notifications where kind = 'chat_locked' and created_at = now();
          r := case when r = 'OK' and v_n = 1 and v_s = 'under_review' and v_m = 2
                    then 'PASS (review rows=1, conversation under_review, notices=2)'
                    else format('FAIL (%s reviews=%s conv=%s notices=%s)', r, v_n, v_s, v_m) end;
        elsif i = 4 then
          select count(*) into v_n from admin.conversation_reviews where conversation_id = conv and source = 'user_report' and reported_reason = 'zz4c report' and status = 'pending';
          select status into v_s from public.conversations where id = conv;
          r := case when r = 'OK' and v_n = 1 and v_s = 'under_review' then 'PASS (review rows=1, conversation under_review)'
                    else format('FAIL (%s reviews=%s conv=%s)', r, v_n, v_s) end;
        else
          select count(*) into v_n from admin.conversation_reviews where flagged_message_id = v_msg;
          select status into v_s from public.conversations where id = conv;
          r := case when r = 'OK' and v_n = 0 and v_s = 'active' then 'PASS (sent, 0 review rows, still active)'
                    else format('FAIL (%s reviews=%s conv=%s)', r, v_n, v_s) end;
        end if;

      elsif i = 6 then
        insert into admin.conversation_reviews (conversation_id, source, status, reported_reason) values (conv, 'user_report', 'pending', 'zz4c a1') returning id into v_rev;
        update public.conversations set status = 'under_review' where id = conv;
        perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', sa::text, true);
        set local role authenticated;
        perform public.resolve_conversation_review(v_rev, 'resumed', v_reason, true);
        reset role;
        select status || '/' || (reviewed_by = sa)::text || '/' || (reason_id = v_reason)::text into v_s from admin.conversation_reviews where id = v_rev;
        r := case when v_s = 'resumed/true/true' and (select status from public.conversations where id = conv) = 'active'
                  then 'PASS (admin row resumed, reviewed_by=super_admin, chat active)' else 'FAIL (' || coalesce(v_s, 'no row') || ')' end;

      elsif i = 7 then
        perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', sa::text, true);
        set local role authenticated;
        perform public.set_account_status(ve, 'suspended', v_reason, 'admin_manual');
        reset role;
        select count(*) into v_n from admin.account_suspensions where profile_id = ve and active and suspended_by = sa;
        v_s := (select account_status::text from public.profiles where id = ve);
        set local role authenticated;
        perform public.set_account_status(ve, 'active', null, 'admin_manual');
        reset role;
        select count(*) into v_m from admin.account_suspensions where profile_id = ve and not active and reinstated_by = sa;
        r := case when v_n = 1 and v_s = 'suspended' and v_m = 1 and (select account_status::text from public.profiles where id = ve) = 'active'
                  then 'PASS (admin row active -> reinstated, profile suspended -> active)' else format('FAIL (open=%s status=%s closed=%s)', v_n, v_s, v_m) end;

      elsif i in (8, 9, 10) then
        if i = 8 then
          insert into admin.conversation_reviews (conversation_id, source, status) values (conv, 'user_report', 'pending') returning id into v_rev;
        end if;
        perform set_config('request.jwt.claims', json_build_object('sub', bu, 'role', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', bu::text, true);
        set local role authenticated;
        begin
          if i = 8 then perform public.resolve_conversation_review(v_rev, 'resumed', null, true);
          elsif i = 9 then perform public.set_account_status(ve, 'suspended', v_reason, 'admin_manual');
          else perform public.submit_report(gen_random_uuid(), null, 'zz4c foreign');
          end if;
          r := 'ALLOWED';
        exception when others then r := 'ERR ' || sqlstate;
        end;
        reset role;
        r := case when (i = 8 and r = 'ERR 42501') or (i in (9, 10) and r like 'ERR %') then 'PASS (' || r || ')' else 'FAIL (' || r || ')' end;

      elsif i = 11 then
        insert into public.messages (conversation_id, sender_id, body) values (conv, bu, null) returning id into v_msg;
        insert into admin.conversation_reviews (conversation_id, flagged_message_id, source, status) values (conv, v_msg, 'user_report', 'pending') returning id into v_rev;
        delete from public.messages where id = v_msg;
        r := case when exists (select 1 from admin.conversation_reviews where id = v_rev and flagged_message_id is null) then 'PASS (review kept, flagged_message_id NULL)' else 'FAIL' end;

      elsif i = 12 then
        insert into admin.conversation_reviews (conversation_id, source, status) values (conv, 'user_report', 'pending') returning id into v_rev;
        select count(*) into v_m from admin.conversation_reviews where conversation_id = conv;
        delete from public.conversations where id = conv;
        r := case when not exists (select 1 from admin.conversation_reviews where conversation_id = conv)
                  then format('PASS (%s review rows cascaded)', v_m) else 'FAIL' end;

      else
        begin
          if i = 13 then insert into admin.account_suspensions (profile_id, reason_id, source) values (gen_random_uuid(), v_reason, 'admin_manual');
          elsif i = 14 then insert into admin.conversation_reviews (conversation_id, matched_pattern_id, source, status) values (conv, gen_random_uuid(), 'regex_flag', 'pending');
          else
            insert into admin.account_suspensions (profile_id, reason_id, source) values (ve, v_reason, 'admin_manual');
            delete from admin.chat_block_reasons where id = v_reason;
          end if;
          r := 'ALLOWED';
        exception when others then r := 'ERR ' || sqlstate;
        end;
        r := case when r = 'ERR 23503' then 'PASS (23503)' else 'FAIL (' || r || ')' end;
      end if;

      raise exception using errcode = 'P0099', message = r;
    exception
      when sqlstate 'P0099' then
        out := out || rpad(cases[i], 44) || sqlerrm || E'\n';
        if sqlerrm not like 'PASS%' then fails := fails + 1; end if;
      when others then
        out := out || rpad(cases[i], 44) || 'HARNESS ERROR ' || sqlstate || ' ' || sqlerrm || E'\n';
        fails := fails + 1;
    end;
  end loop;

  raise exception 'P4C MESSAGING + FK (rolled back) failures=% %', fails, E'\n' || out;
end
$p4c$
