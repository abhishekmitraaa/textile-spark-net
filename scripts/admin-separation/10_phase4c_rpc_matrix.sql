-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 10 — Phase 4c RPC matrix (post-move).
--
-- Harness 08 compared direct table queries with the 4a RPCs while the five
-- chat-moderation / suspension tables were in public. After 4c the direct half
-- cannot run (the tables are admin.*, unreachable by client roles), so this is the
-- post-move successor: the SAME fixtures (fixed ids and timestamps, now seeded into
-- admin.*), the SAME 7 personas and the SAME 20 RPC calls, each compared with the
-- RPC result 08 recorded after 4a (2026-09-21):
--
--   super_admin  every check = BASE below
--   support      = BASE, except r3/r4/r5 (reason add / rename / activate) = ERR 42501
--   ads_moderator, vendor_ops, buyer-participant, vendor-participant, anon
--                every check = ERR 42501
--
-- A read's value is `rows:md5` of the full row content in returned order, so a
-- row, column, join or ordering change shows up, not just a count change. Verdict
-- per cell: SAME or CHANGED. Expected: changed=0.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p10$
declare
  sa  uuid := '33333333-3333-3333-3333-333333333333';
  bu  uuid := '11111111-1111-1111-1111-111111111111';
  ve  uuid := '22222222-2222-2222-2222-222222222222';
  fx_kw   uuid := '4a000000-0000-0000-0000-000000000001';
  fx_pat  uuid := '4a000000-0000-0000-0000-000000000002';
  fx_rsn  uuid := '4a000000-0000-0000-0000-000000000003';
  fx_rv1  uuid := '4a000000-0000-0000-0000-000000000004';
  fx_rv2  uuid := '4a000000-0000-0000-0000-000000000005';
  fx_s1   uuid := '4a000000-0000-0000-0000-000000000006';
  fx_s2   uuid := '4a000000-0000-0000-0000-000000000007';
  missing uuid := '4a000000-0000-0000-0000-0000000000ff';
  v_conv uuid; v_msg uuid; v_pat_used uuid; v_reason uuid;
  personas text[] := array['super_admin', 'support(in-txn)', 'ads_moderator(in-txn)', 'vendor_ops(in-txn)', 'buyer-participant', 'vendor-participant', 'anon'];
  checks text[] := array['k1 kw list', 'k2 kw add', 'k3 kw remove', 'k4 kw remove missing',
                         'p1 pat list', 'p2 pat add', 'p3 pat add bad regex', 'p4 pat toggle', 'p5 pat remove', 'p6 pat remove in-use',
                         'r1 reasons all', 'r2 reasons active', 'r3 reason add', 'r4 reason rename', 'r5 reason activate',
                         'c1 reviews pending', 'c2 reviews resumed', 'c3 reviews thread',
                         's1 susp profile', 's2 susp open page'];
  -- RPC column of harness 08, super_admin row, after 4a.
  base text[] := array['1:1160cc30d5', '1:67cd0a0cb4', '1:9b971233df', '0:-',
                       '4:7944443465', '1:e898f1d75f', 'ERR 2201B', '1:34d0ff259c', '1:fba0910e67', 'ERR 23503',
                       '8:8de042721b', '7:6917ed447e', '1:a664d18129', '1:0d23f40fa2', '1:1a0d75e160',
                       '1:b0ad6910cf', '2:3b4a04d785', '3:39c06a8cb3',
                       '2:57bf58c8cc', '1:982c0927d9'];
  agg text := $a$count(*)::text || ':' || coalesce(left(md5(string_agg(s.k, ';' order by s.ord)), 10), '-')$a$;
  kw_c  text := 'id, term, added_by, created_at, adder_full_name, adder_email';
  pat_c text := 'id, pattern, label, active, added_by, created_at, adder_full_name, adder_email';
  rsn_c text := 'id, reason, active, created_by, created_at, creator_full_name, creator_email';
  rev_c text := 'id, conversation_id, flagged_message_id, matched_pattern_id, source, status, reason_id, reviewed_by, reviewed_at, created_at, reported_reason, pattern_label, pattern_pattern, reason, flagged_body, flagged_kind, flagged_created_at, flagged_sender_id, conversation_status, conversation_user_a, conversation_user_b';
  sus_c text := 'id, profile_id, reason_id, source, conversation_review_id, suspended_by, suspended_at, reinstated_by, reinstated_at, active, reason, suspended_by_full_name, suspended_by_email, reinstated_by_full_name, reinstated_by_email';
  q_rpc text[];
  p text; who uuid; i int; r text; expected text; out text := ''; changed int := 0; fixtures text;
begin
  if to_regclass('admin.conversation_reviews') is null then
    raise exception 'P10 is the post-4c matrix: admin.conversation_reviews does not exist (run 08 before the move)';
  end if;

  select r.conversation_id, r.flagged_message_id, r.matched_pattern_id
    into v_conv, v_msg, v_pat_used
    from admin.conversation_reviews r
   where r.matched_pattern_id is not null
   order by r.created_at, r.id limit 1;
  select c.id into v_reason from admin.chat_block_reasons c where c.active order by c.created_at, c.id limit 1;
  if v_conv is null or v_reason is null
     or not exists (select 1 from public.conversations c where c.id = v_conv and bu in (c.user_a, c.user_b) and ve in (c.user_a, c.user_b))
     or exists (select 1 from admin.admin_users u where u.id in (bu, ve) and u.is_active) then
    raise exception 'P10 fixture missing: conv=% reason=%', v_conv, v_reason;
  end if;

  insert into admin.keyword_blocklist (id, term, added_by, created_at)
  values (fx_kw, 'zz4a seeded term', sa, '2026-01-01 00:00:01+00');
  insert into admin.flag_patterns (id, pattern, label, active, added_by, created_at)
  values (fx_pat, 'zz4a[0-9]+', 'zz4a seeded pattern', false, sa, '2026-01-01 00:00:02+00');
  insert into admin.chat_block_reasons (id, reason, active, created_by, created_at)
  values (fx_rsn, 'zz4a seeded reason', false, sa, '2026-01-01 00:00:03+00');
  insert into admin.conversation_reviews (id, conversation_id, flagged_message_id, source, status, reported_reason, created_at)
  values (fx_rv1, v_conv, v_msg, 'user_report', 'pending', 'zz4a pending', '2026-01-01 00:00:04+00');
  insert into admin.conversation_reviews (id, conversation_id, matched_pattern_id, source, status, reason_id, reviewed_by, reviewed_at, created_at)
  values (fx_rv2, v_conv, v_pat_used, 'regex_flag', 'resumed', v_reason, sa, '2026-01-01 00:00:06+00', '2026-01-01 00:00:05+00');
  insert into admin.account_suspensions (id, profile_id, reason_id, source, suspended_by, suspended_at, active)
  values (fx_s1, ve, v_reason, 'admin_manual', sa, '2026-01-01 00:00:07+00', true);
  insert into admin.account_suspensions (id, profile_id, reason_id, source, conversation_review_id, suspended_by, suspended_at, reinstated_by, reinstated_at, active)
  values (fx_s2, ve, v_reason, 'chat_review', fx_rv2, sa, '2026-01-01 00:00:08+00', sa, '2026-01-01 00:00:09+00', false);

  fixtures := 'fixtures: conv=' || left(v_conv::text, 8) || ' rows(kw/pat/rsn/rev/susp)=' ||
              (select count(*) from admin.keyword_blocklist) || '/' || (select count(*) from admin.flag_patterns) || '/' ||
              (select count(*) from admin.chat_block_reasons) || '/' || (select count(*) from admin.conversation_reviews) || '/' ||
              (select count(*) from admin.account_suspensions) || ' (seeded 1/1/1/2/2)';

  q_rpc := array[
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_keyword_list() with ordinality x) s', agg, kw_c),
    format('select %s from (select row(term, added_by is not distinct from auth.uid())::text k, 1 ord from public.admin_keyword_add(''zz4a added term'')) s', agg),
    format('select %s from (select id::text k, 1 ord from public.admin_keyword_remove(%L)) s', agg, fx_kw),
    format('select %s from (select id::text k, 1 ord from public.admin_keyword_remove(%L)) s', agg, missing),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_flag_pattern_list() with ordinality x) s', agg, pat_c),
    format('select %s from (select row(pattern, label, active, added_by is not distinct from auth.uid())::text k, 1 ord from public.admin_flag_pattern_add(''zz4b[0-9]+'', ''zz4a added pattern'')) s', agg),
    format('select %s from (select id::text k, 1 ord from public.admin_flag_pattern_add(''('', ''zz4a bad'')) s', agg),
    format('select %s from (select row(id, active)::text k, 1 ord from public.admin_flag_pattern_update(%L, true)) s', agg, fx_pat),
    format('select %s from (select id::text k, 1 ord from public.admin_flag_pattern_remove(%L)) s', agg, fx_pat),
    format('select %s from (select id::text k, 1 ord from public.admin_flag_pattern_remove(%L)) s', agg, v_pat_used),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_block_reason_list() with ordinality x) s', agg, rsn_c),
    format('select %s from (select row(id, reason)::text k, x.ordinality ord from public.admin_block_reason_list(true) with ordinality x) s', agg),
    format('select %s from (select row(reason, active, created_by is not distinct from auth.uid())::text k, 1 ord from public.admin_block_reason_add(''zz4a added reason'')) s', agg),
    format('select %s from (select row(id, reason, active)::text k, 1 ord from public.admin_block_reason_update(%L, ''zz4a renamed'')) s', agg, fx_rsn),
    format('select %s from (select row(id, reason, active)::text k, 1 ord from public.admin_block_reason_update(%L, null, true)) s', agg, fx_rsn),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_conversation_review_list(''pending'') with ordinality x) s', agg, rev_c),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_conversation_review_list(''resumed'') with ordinality x) s', agg, rev_c),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_conversation_review_list(null, %L) with ordinality x) s', agg, rev_c, v_conv),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_account_suspension_list(%L::uuid[]) with ordinality x) s', agg, sus_c, array[ve]),
    format('select %s from (select row(%s)::text k, x.ordinality ord from public.admin_account_suspension_list(%L::uuid[], true) with ordinality x) s', agg, sus_c, array[ve, bu])
  ];

  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 1..array_length(checks, 1) loop
      expected := case
        when p = 'super_admin' then base[i]
        when p = 'support(in-txn)' then case when i in (13, 14, 15) then 'ERR 42501' else base[i] end
        else 'ERR 42501' end;
      begin
        if p like '%(in-txn)' then
          update public.profiles set is_admin = true, admin_role = split_part(p, '(', 1)::public.admin_role_type where id = bu;
        end if;
        who := case p when 'super_admin' then sa when 'vendor-participant' then ve when 'anon' then null else bu end;
        if who is null then
          perform set_config('request.jwt.claims', '', true);
          perform set_config('request.jwt.claim.sub', '', true);
          set local role anon;
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', who::text, true);
          set local role authenticated;
        end if;
        begin
          execute q_rpc[i] into r;
          raise exception using errcode = 'P0097', message = r;
        exception
          when sqlstate 'P0097' then r := sqlerrm;
          when others then r := 'ERR ' || sqlstate;
        end;
        if r is distinct from expected then
          changed := changed + 1;
          out := out || E'\n  CHANGED ' || rpad(checks[i], 22) || ' after-4a=' || expected || ' now=' || r;
        end if;
        raise exception using errcode = 'P0099';
      exception
        when sqlstate 'P0099' then null;
        when others then
          out := out || E'\n  ' || checks[i] || ': HARNESS ERROR ' || sqlstate || ' ' || sqlerrm;
          changed := changed + 1;
      end;
    end loop;
    out := out || ' ' || array_length(checks, 1) || ' checks' || E'\n';
  end loop;

  raise exception 'P10 RPC MATRIX (rolled back) changed=% of % %', changed, array_length(personas, 1) * array_length(checks, 1), E'\n' || fixtures || E'\n' || out;
end
$p10$
