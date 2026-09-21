-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 08 — Phase 4a RPC parity (chat moderation +
-- suspension tables).
--
-- ╔═ PRE-MOVE ARTIFACT — VALID ONLY WHILE THE FIVE TABLES ARE IN public ══════╗
-- ║ The direct half queries public.keyword_blocklist, flag_patterns,           ║
-- ║ chat_block_reasons, conversation_reviews and account_suspensions as the    ║
-- ║ panel does today. After Phase 4c moves them, the direct half no longer     ║
-- ║ resolves by design; keep this file as the record of what verified 4a.      ║
-- ║ Moved 2026-09-21 (Phase 4c): post-move, run 10_phase4c_rpc_matrix.sql.     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
--
-- For every persona, runs each panel operation TWICE — the current direct query
-- (PostgREST embeds written as the equivalent LEFT JOINs, which apply the same
-- per-table RLS) and the new RPC — and compares the outcomes:
--
--   k1 keyword list             ChatKeywords select      vs admin_keyword_list()
--   k2 keyword add              ChatKeywords insert      vs admin_keyword_add
--   k3 keyword remove           ChatKeywords delete      vs admin_keyword_remove (seeded row)
--   k4 keyword remove missing   delete, no such id       vs admin_keyword_remove
--   p1 pattern list             ChatPatterns select      vs admin_flag_pattern_list()
--   p2 pattern add              ChatPatterns insert      vs admin_flag_pattern_add
--   p3 pattern add, bad regex   insert '('               vs admin_flag_pattern_add('(')
--   p4 pattern toggle           ChatPatterns update      vs admin_flag_pattern_update
--   p5 pattern remove           ChatPatterns delete      vs admin_flag_pattern_remove (seeded)
--   p6 pattern remove, in use   delete (FK from review)  vs admin_flag_pattern_remove
--   r1 reasons, all             ChatReasons select       vs admin_block_reason_list()
--   r2 reasons, active          lib/chat.ts select       vs admin_block_reason_list(true)
--   r3 reason add               ChatReasons insert       vs admin_block_reason_add
--   r4 reason rename            ChatReasons update       vs admin_block_reason_update(id, text)
--   r5 reason (de)activate      ChatReasons update       vs admin_block_reason_update(id, null, bool)
--   c1 reviews pending          ChatReview select        vs admin_conversation_review_list('pending')
--   c2 reviews resumed          ChatReview select        vs admin_conversation_review_list('resumed')
--   c3 reviews of a thread      ChatThread select        vs admin_conversation_review_list(null, conv)
--   s1 suspensions of a profile AccountStatus select     vs admin_account_suspension_list({vendor})
--   s2 open suspensions, page   Accounts select          vs admin_account_suspension_list({vendor,buyer}, true)
--
-- Personas: super_admin (demo-admin); support, ads_moderator and vendor_ops
-- (demo-buyer promoted inside the subtransaction through profiles → mirror);
-- buyer-participant (demo-buyer, a member of the reviewed conversation);
-- vendor-participant (demo-vendor, the other member, and the profile the seeded
-- suspensions are about); anon.
--
-- Result per call: `rows:md5` of the full row content IN RETURNED ORDER (reads,
-- so ordering is checked too; the RPC side uses WITH ORDINALITY), the same for
-- writes over the non-generated columns plus `added_by/created_by = auth.uid()`,
-- or `ERR <sqlstate>`. Verdict:
--   SAME         identical outcome (same rows in the same order, or same error)
--   DENIED-BOTH  direct query touched 0 rows (RLS filtered) and the RPC raised
--                42501 — the one intended difference, denied either way
--   MISMATCH     anything else
-- Fixtures (fixed ids and timestamps, rolled back) guarantee every read check
-- returns at least one row to an admitted persona, so a narrowing bug (rows
-- directly, 42501 via RPC) and a widening bug (0 rows directly, rows via RPC)
-- both surface as MISMATCH.
--
-- Mutation testing: set `mutate` below to a CREATE OR REPLACE that widens or
-- narrows one RPC's gate; the run must then report MISMATCHes. It is executed
-- inside this block, so it rolls back with everything else.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p4a$
declare
  mutate text := null;
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
  agg text := $a$count(*)::text || ':' || coalesce(left(md5(string_agg(s.k, ';' order by s.ord)), 10), '-')$a$;
  kw_c  text := 'id, term, added_by, created_at, adder_full_name, adder_email';
  pat_c text := 'id, pattern, label, active, added_by, created_at, adder_full_name, adder_email';
  rsn_c text := 'id, reason, active, created_by, created_at, creator_full_name, creator_email';
  rev_c text := 'id, conversation_id, flagged_message_id, matched_pattern_id, source, status, reason_id, reviewed_by, reviewed_at, created_at, reported_reason, pattern_label, pattern_pattern, reason, flagged_body, flagged_kind, flagged_created_at, flagged_sender_id, conversation_status, conversation_user_a, conversation_user_b';
  sus_c text := 'id, profile_id, reason_id, source, conversation_review_id, suspended_by, suspended_at, reinstated_by, reinstated_at, active, reason, suspended_by_full_name, suspended_by_email, reinstated_by_full_name, reinstated_by_email';
  rev_from text := $f$
      from public.conversation_reviews r
      left join public.flag_patterns      fp  on fp.id  = r.matched_pattern_id
      left join public.chat_block_reasons cbr on cbr.id = r.reason_id
      left join public.messages           m   on m.id   = r.flagged_message_id
      left join public.conversations      cv  on cv.id  = r.conversation_id$f$;
  rev_sel text := $f$r.id, r.conversation_id, r.flagged_message_id, r.matched_pattern_id, r.source, r.status,
      r.reason_id, r.reviewed_by, r.reviewed_at, r.created_at, r.reported_reason,
      fp.label as pattern_label, fp.pattern as pattern_pattern, cbr.reason,
      m.body as flagged_body, m.kind::text as flagged_kind, m.created_at as flagged_created_at,
      m.sender_id as flagged_sender_id, cv.status::text as conversation_status,
      cv.user_a as conversation_user_a, cv.user_b as conversation_user_b$f$;
  sus_sel text := $f$s.id, s.profile_id, s.reason_id, s.source, s.conversation_review_id, s.suspended_by,
      s.suspended_at, s.reinstated_by, s.reinstated_at, s.active, cbr.reason,
      sb.full_name as suspended_by_full_name, sb.email as suspended_by_email,
      rb.full_name as reinstated_by_full_name, rb.email as reinstated_by_email
      from public.account_suspensions s
      left join public.chat_block_reasons cbr on cbr.id = s.reason_id
      left join public.profiles sb on sb.id = s.suspended_by
      left join public.profiles rb on rb.id = s.reinstated_by$f$;
  q_direct text[]; q_rpc text[];
  p text; who uuid; i int; d text; r text; verdict text;
  out text := ''; mismatches int := 0; fixtures text;
begin
  if mutate is not null then execute mutate; end if;

  -- Fixtures ──────────────────────────────────────────────────────────────────
  select r.conversation_id, r.flagged_message_id, r.matched_pattern_id
    into v_conv, v_msg, v_pat_used
    from public.conversation_reviews r
   where r.matched_pattern_id is not null
   order by r.created_at, r.id limit 1;
  select c.id into v_reason from public.chat_block_reasons c where c.active order by c.created_at, c.id limit 1;
  if v_conv is null or v_reason is null
     or not exists (select 1 from public.conversations c where c.id = v_conv and bu in (c.user_a, c.user_b) and ve in (c.user_a, c.user_b))
     or exists (select 1 from admin.admin_users u where u.id in (bu, ve) and u.is_active) then
    raise exception 'P4A fixture missing: conv=% reason=% (the reviewed conversation must be between demo-buyer and demo-vendor, neither an admin)', v_conv, v_reason;
  end if;

  insert into public.keyword_blocklist (id, term, added_by, created_at)
  values (fx_kw, 'zz4a seeded term', sa, '2026-01-01 00:00:01+00');
  insert into public.flag_patterns (id, pattern, label, active, added_by, created_at)
  values (fx_pat, 'zz4a[0-9]+', 'zz4a seeded pattern', false, sa, '2026-01-01 00:00:02+00');
  insert into public.chat_block_reasons (id, reason, active, created_by, created_at)
  values (fx_rsn, 'zz4a seeded reason', false, sa, '2026-01-01 00:00:03+00');
  insert into public.conversation_reviews (id, conversation_id, flagged_message_id, source, status, reported_reason, created_at)
  values (fx_rv1, v_conv, v_msg, 'user_report', 'pending', 'zz4a pending', '2026-01-01 00:00:04+00');
  insert into public.conversation_reviews (id, conversation_id, matched_pattern_id, source, status, reason_id, reviewed_by, reviewed_at, created_at)
  values (fx_rv2, v_conv, v_pat_used, 'regex_flag', 'resumed', v_reason, sa, '2026-01-01 00:00:06+00', '2026-01-01 00:00:05+00');
  insert into public.account_suspensions (id, profile_id, reason_id, source, suspended_by, suspended_at, active)
  values (fx_s1, ve, v_reason, 'admin_manual', sa, '2026-01-01 00:00:07+00', true);
  insert into public.account_suspensions (id, profile_id, reason_id, source, conversation_review_id, suspended_by, suspended_at, reinstated_by, reinstated_at, active)
  values (fx_s2, ve, v_reason, 'chat_review', fx_rv2, sa, '2026-01-01 00:00:08+00', sa, '2026-01-01 00:00:09+00', false);

  fixtures := 'fixtures: conv=' || left(v_conv::text, 8) || ' pattern_in_use=' || left(v_pat_used::text, 8)
           || ' rows(kw/pat/rsn/rev/susp)=' || (select count(*) from public.keyword_blocklist) || '/' || (select count(*) from public.flag_patterns)
           || '/' || (select count(*) from public.chat_block_reasons) || '/' || (select count(*) from public.conversation_reviews)
           || '/' || (select count(*) from public.account_suspensions) || ' (seeded 1/1/1/2/2)';

  -- Direct half: what the panel sends today ─────────────────────────────────
  q_direct := array[
    -- k1..k4
    format('select %s from (select row(%s)::text k, row_number() over (order by term, id) ord from (select k.id, k.term, k.added_by, k.created_at, pr.full_name adder_full_name, pr.email adder_email from public.keyword_blocklist k left join public.profiles pr on pr.id = k.added_by) t) s', agg, kw_c),
    format('with x as (insert into public.keyword_blocklist (term, added_by) values (''zz4a added term'', auth.uid()) returning term, added_by) select %s from (select row(term, added_by is not distinct from auth.uid())::text k, 1 ord from x) s', agg),
    format('with x as (delete from public.keyword_blocklist where id = %L returning id) select %s from (select id::text k, 1 ord from x) s', fx_kw, agg),
    format('with x as (delete from public.keyword_blocklist where id = %L returning id) select %s from (select id::text k, 1 ord from x) s', missing, agg),
    -- p1..p6
    format('select %s from (select row(%s)::text k, row_number() over (order by active desc, label, id) ord from (select f.id, f.pattern, f.label, f.active, f.added_by, f.created_at, pr.full_name adder_full_name, pr.email adder_email from public.flag_patterns f left join public.profiles pr on pr.id = f.added_by) t) s', agg, pat_c),
    format('with x as (insert into public.flag_patterns (pattern, label, active, added_by) values (''zz4b[0-9]+'', ''zz4a added pattern'', true, auth.uid()) returning pattern, label, active, added_by) select %s from (select row(pattern, label, active, added_by is not distinct from auth.uid())::text k, 1 ord from x) s', agg),
    format('with x as (insert into public.flag_patterns (pattern, label, active, added_by) values (''('', ''zz4a bad'', true, auth.uid()) returning id) select %s from (select id::text k, 1 ord from x) s', agg),
    format('with x as (update public.flag_patterns set active = true where id = %L returning id, active) select %s from (select row(id, active)::text k, 1 ord from x) s', fx_pat, agg),
    format('with x as (delete from public.flag_patterns where id = %L returning id) select %s from (select id::text k, 1 ord from x) s', fx_pat, agg),
    format('with x as (delete from public.flag_patterns where id = %L returning id) select %s from (select id::text k, 1 ord from x) s', v_pat_used, agg),
    -- r1..r5
    format('select %s from (select row(%s)::text k, row_number() over (order by active desc, reason, id) ord from (select c.id, c.reason, c.active, c.created_by, c.created_at, pr.full_name creator_full_name, pr.email creator_email from public.chat_block_reasons c left join public.profiles pr on pr.id = c.created_by) t) s', agg, rsn_c),
    format('select %s from (select row(id, reason)::text k, row_number() over (order by reason, id) ord from public.chat_block_reasons where active) s', agg),
    format('with x as (insert into public.chat_block_reasons (reason, active, created_by) values (''zz4a added reason'', true, auth.uid()) returning reason, active, created_by) select %s from (select row(reason, active, created_by is not distinct from auth.uid())::text k, 1 ord from x) s', agg),
    format('with x as (update public.chat_block_reasons set reason = ''zz4a renamed'' where id = %L returning id, reason, active) select %s from (select row(id, reason, active)::text k, 1 ord from x) s', fx_rsn, agg),
    format('with x as (update public.chat_block_reasons set active = true where id = %L returning id, reason, active) select %s from (select row(id, reason, active)::text k, 1 ord from x) s', fx_rsn, agg),
    -- c1..c3
    format('select %s from (select row(%s)::text k, row_number() over (order by created_at desc, id desc) ord from (select %s %s where r.status = ''pending'') t) s', agg, rev_c, rev_sel, rev_from),
    format('select %s from (select row(%s)::text k, row_number() over (order by reviewed_at desc nulls first, created_at desc, id desc) ord from (select %s %s where r.status = ''resumed'') t) s', agg, rev_c, rev_sel, rev_from),
    format('select %s from (select row(%s)::text k, row_number() over (order by created_at desc, id desc) ord from (select %s %s where r.conversation_id = %L) t) s', agg, rev_c, rev_sel, rev_from, v_conv),
    -- s1..s2
    format('select %s from (select row(%s)::text k, row_number() over (order by suspended_at desc, id desc) ord from (select %s where s.profile_id = %L) t) s', agg, sus_c, sus_sel, ve),
    format('select %s from (select row(%s)::text k, row_number() over (order by suspended_at desc, id desc) ord from (select %s where s.profile_id = any (%L::uuid[]) and s.active) t) s', agg, sus_c, sus_sel, array[ve, bu])
  ];

  -- RPC half ─────────────────────────────────────────────────────────────────
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
          execute q_direct[i] into d;
          raise exception using errcode = 'P0097', message = d;
        exception
          when sqlstate 'P0097' then d := sqlerrm;
          when others then d := 'ERR ' || sqlstate;
        end;

        begin
          execute q_rpc[i] into r;
          raise exception using errcode = 'P0097', message = r;
        exception
          when sqlstate 'P0097' then r := sqlerrm;
          when others then r := 'ERR ' || sqlstate;
        end;

        if d = r then
          verdict := 'SAME';
        elsif r = 'ERR 42501' and (d like '0:%' or d = 'ERR 42501') then
          verdict := 'DENIED-BOTH';
        else
          verdict := 'MISMATCH';
          mismatches := mismatches + 1;
        end if;
        out := out || E'\n  ' || rpad(checks[i], 22) || ' direct=' || rpad(d, 14) || ' rpc=' || rpad(r, 14) || ' ' || verdict;
        raise exception using errcode = 'P0099';
      exception
        when sqlstate 'P0099' then null;
        when others then
          out := out || E'\n  ' || checks[i] || ': HARNESS ERROR ' || sqlstate || ' ' || sqlerrm;
          mismatches := mismatches + 1;
      end;
    end loop;
    out := out || E'\n';
  end loop;

  raise exception 'P4A RPC PARITY (rolled back) mismatches=% %', mismatches, E'\n' || fixtures || E'\n' || out;
end
$p4a$
