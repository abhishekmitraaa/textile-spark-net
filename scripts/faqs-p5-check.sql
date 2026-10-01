-- FAQ surface and translations check (Help & Support P5, 2026-10-01): seller_help, the
-- translations column and its rules, admin_faq_set_translations(), admin_faq_update()
-- clearing translations when the English changes, and the column grant.
--
-- One DO block, run as postgres (MCP execute_sql). It changes rows only inside its own
-- transaction and ends with RAISE EXCEPTION, so nothing is kept. To rehearse, paste
-- 20261001130000_faqs_seller_help_and_translations.sql (and optionally the content
-- migration, or a sample of it) above this block in the same call.
--
-- Fixture, rolled back: demo-buyer (1111…) is made a support admin; demo-vendor (2222…)
-- stays a non-admin.

do $t$
declare
  buyer   constant uuid := '11111111-1111-1111-1111-111111111111';
  vendor  constant uuid := '22222222-2222-2222-2222-222222222222';
  results text[] := '{}';
  fails   int := 0;
  v_id    uuid;
  v_tr    jsonb;
  v_n     int;
  r       record;
begin
  insert into admin.admin_users (id, admin_role, is_active) values (buyer, 'support', true)
    on conflict (id) do update set admin_role = 'support', is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);

  -- F1 support adds to seller_help
  select id into v_id from public.admin_faq_add('seller_help', 'Test', 'zz-p5 question?', 'zz-p5 answer.', null);
  if v_id is not null then results := results || 'F1 ok'::text;
  else fails := fails + 1; results := results || 'F1 FAIL'::text; end if;

  -- F2 an unknown surface is refused
  begin
    perform public.admin_faq_add('nowhere', null, 'q?', 'a.', null);
    fails := fails + 1; results := results || 'F2 FAIL accepted'::text;
  exception when sqlstate '22023' then results := results || 'F2 ok'::text;
  end;

  -- F3 translations are stored, trimmed
  select translations into v_tr from public.admin_faq_set_translations(v_id,
    '{"hi": {"question": "  प्रश्न?  ", "answer": "उत्तर।"}, "gu": {"question": "પ્રશ્ન?", "answer": "જવાબ."}}'::jsonb);
  if v_tr -> 'hi' ->> 'question' = 'प्रश्न?' and v_tr -> 'gu' ->> 'answer' = 'જવાબ.' then results := results || 'F3 ok'::text;
  else fails := fails + 1; results := results || ('F3 FAIL ' || coalesce(v_tr::text, 'null')); end if;

  -- F4 an unknown language, or an empty answer, is refused
  begin
    perform public.admin_faq_set_translations(v_id, '{"fr": {"question": "q", "answer": "a"}}'::jsonb);
    fails := fails + 1; results := results || 'F4a FAIL accepted'::text;
  exception when sqlstate '22023' then results := results || 'F4a ok'::text;
  end;
  begin
    perform public.admin_faq_set_translations(v_id, '{"hi": {"question": "q", "answer": "  "}}'::jsonb);
    fails := fails + 1; results := results || 'F4b FAIL accepted'::text;
  exception when sqlstate '22023' then results := results || 'F4b ok'::text;
  end;

  -- F6 toggling active keeps the translations
  perform public.admin_faq_update(v_id, null, null, null, false);
  perform public.admin_faq_update(v_id, null, null, null, true);
  -- F8 saving the same English keeps them too
  perform public.admin_faq_update(v_id, 'Test', 'zz-p5 question?', 'zz-p5 answer.', null);
  execute 'reset role';
  select translations into v_tr from public.faqs where id = v_id;
  if v_tr ? 'hi' and v_tr ? 'gu' then results := results || 'F6+F8 ok'::text;
  else fails := fails + 1; results := results || 'F6+F8 FAIL'::text; end if;

  -- F9 signed out reads translations of an active row, and still not created_by
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into v_n from public.faqs where id = v_id and translations ? 'hi';
  if v_n = 1 then results := results || 'F9a ok'::text;
  else fails := fails + 1; results := results || ('F9a FAIL ' || v_n); end if;
  begin
    perform created_by from public.faqs limit 1;
    fails := fails + 1; results := results || 'F9b FAIL created_by readable'::text;
  exception when insufficient_privilege then results := results || 'F9b ok'::text;
  end;
  execute 'reset role';

  -- F10 admin_faq_translations returns them
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', buyer, 'role', 'authenticated')::text, true);
  select l.translations into v_tr from public.admin_faq_translations('seller_help') l where l.id = v_id;
  if v_tr ? 'gu' then results := results || 'F10 ok'::text;
  else fails := fails + 1; results := results || 'F10 FAIL'::text; end if;

  -- F7 changing the English answer clears them
  perform public.admin_faq_update(v_id, null, null, 'zz-p5 a different answer.', null);
  execute 'reset role';
  if (select translations from public.faqs where id = v_id) = '{}'::jsonb then results := results || 'F7 ok'::text;
  else fails := fails + 1; results := results || 'F7 FAIL'::text; end if;

  -- F5 a non-admin can't translate
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', vendor, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_faq_set_translations(v_id, '{"hi": {"question": "q", "answer": "a"}}'::jsonb);
    fails := fails + 1; results := results || 'F5 FAIL accepted'::text;
  exception when insufficient_privilege then results := results || 'F5 ok'::text;
  end;
  execute 'reset role';

  -- F11 the table refuses bad translations written directly
  begin
    update public.faqs set translations = '{"hi": {"question": "q"}}'::jsonb where id = v_id;
    fails := fails + 1; results := results || 'F11 FAIL accepted'::text;
  exception when check_violation then results := results || 'F11 ok'::text;
  end;

  -- F12 the surface check takes seller_help and nothing unknown
  begin
    insert into public.faqs (surface, question, answer, position) values ('nowhere', 'q', 'a', 1);
    fails := fails + 1; results := results || 'F12 FAIL accepted'::text;
  exception when check_violation then results := results || 'F12 ok'::text;
  end;

  -- C1-C4 the content, if a sample or the whole content migration ran above
  select count(*) into v_n from public.faqs
   where surface = 'buyer_help' and question = 'How do I find the right vendors for my needs?' and translations ? 'hi';
  results := results || ('C1 backfilled buyer rows matching the sample: ' || v_n);
  select count(*) into v_n from public.faqs where surface = 'seller_help' and active and translations ? 'gu' and question <> 'zz-p5 question?';
  results := results || ('C2 seller_help rows with translations: ' || v_n);
  select count(*) into v_n from public.faqs where surface = 'buyer_help' and not active and translations ? 'hi';
  results := results || ('C3 inactive MPF-14 drafts: ' || v_n);
  select count(*) into v_n from public.help_guides where body ? 'gu' and slug in
    ('complete-verification', 'request-a-callback', 'audio-pdf-image-support', 'payment-and-subscription');
  results := results || ('C4 Quick Guides: ' || v_n);

  raise exception 'FAQ P5 CHECK: % failed. %', fails, array_to_string(results, ' | ');
end
$t$;
