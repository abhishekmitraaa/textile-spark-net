-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 04 — Phase 3a RPC parity.
--
-- For every persona, runs each panel operation TWICE — the current direct query
-- on the still-public table, and the new RPC — and compares the outcomes:
--
--   c1 flags by entity      FlagLog.tsx read    vs admin_flag_list('ad', ad)
--   c2 flags newest 25      Reports.tsx read    vs admin_flag_list(null, null, 25)
--   c3 flag add             FlagLog.tsx insert  vs admin_flag_add(...)  (+ author = auth.uid(), persisted)
--   c4 flag add, bad type   insert 'video'      vs admin_flag_add('video', ...)
--   c5 log, owner's ad      AdReviewQueue read  vs admin_ad_review_log_list(ad)
--   c6 log, another ad      AdReviewQueue read  vs admin_ad_review_log_list(ad2)
--
-- Personas: super_admin (demo-admin); support and ads_moderator (demo-buyer
-- promoted inside the subtransaction through profiles → mirror); the vendor who
-- owns `ad`; another non-admin vendor; buyer (demo-buyer); anon.
--
-- Result per call: `rows:md5` of the full row content (reads), `OK author_is_self=…
-- persisted=…` (writes), or `ERR <sqlstate>`. Verdict:
--   SAME         identical outcome (same rows, or same error)
--   DENIED-BOTH  direct query returned 0 rows (RLS filtered) and the RPC raised
--                42501 — the one intended difference, denied either way
--   MISMATCH     anything else
-- Fixtures are chosen so every ADMITTED persona sees at least one row in c1, c2,
-- c5 and c6: 3 flags are inserted (rolled back), `ad` is the campaign with the
-- most log rows, `ad2` is a campaign with log rows owned by someone else. So a
-- narrowing bug (rows directly, 42501 via RPC) and a widening bug (0 rows
-- directly, rows via RPC) both surface as MISMATCH; DENIED-BOTH can only mean
-- the policy genuinely excludes that persona.
--
-- Valid while admin_flags / ad_review_log are still in public (Phase 3a–3b). In
-- 3c the direct-query half stops being runnable by client roles by design.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $p3a$
declare
  sa  uuid := '33333333-3333-3333-3333-333333333333';
  bu  uuid := '11111111-1111-1111-1111-111111111111';
  v_ad uuid; v_owner uuid; v_ad2 uuid; v_ad2_owner uuid; v_other uuid;
  personas text[] := array['super_admin', 'support(in-txn)', 'ads_moderator(in-txn)', 'owner-vendor', 'other-vendor', 'buyer', 'anon'];
  checks   text[] := array['c1 flags by entity', 'c2 flags newest 25', 'c3 flag add', 'c4 flag add bad type', 'c5 log own ad', 'c6 log other ad'];
  q_direct text[]; q_rpc text[];
  flag_cols text := 'id::text||''|''||entity_type||''|''||entity_id::text||''|''||note||''|''||author_id::text||''|''||created_at::text';
  log_cols  text := 'id::text||''|''||ad_id::text||''|''||coalesce(reviewer_id::text,'''')||''|''||decision||''|''||coalesce(reason_code,'''')||''|''||coalesce(note,'''')||''|''||coalesce(previous_status,'''')||''|''||coalesce(new_status,'''')||''|''||created_at::text';
  p text; who uuid; i int; d text; r text; t text; n bigint; verdict text;
  out text := ''; mismatches int := 0; fixtures text;
begin
  -- Fixtures
  select l.ad_id, a.vendor_id into v_ad, v_owner
    from public.ad_review_log l join public.advertisements a on a.id = l.ad_id
   group by l.ad_id, a.vendor_id order by count(*) desc, l.ad_id limit 1;
  select l.ad_id, a.vendor_id into v_ad2, v_ad2_owner
    from public.ad_review_log l join public.advertisements a on a.id = l.ad_id
   where a.vendor_id is distinct from v_owner
   group by l.ad_id, a.vendor_id order by count(*) desc, l.ad_id limit 1;
  select vp.id into v_other from public.vendor_profiles vp
   where vp.id <> v_owner and vp.id <> bu and vp.id is distinct from v_ad2_owner
     and not exists (select 1 from admin.admin_users u where u.id = vp.id and u.is_active)
   order by vp.id limit 1;
  if v_ad is null or v_ad2 is null or v_other is null then
    raise exception 'P3A fixture missing: ad=% ad2=% other_vendor=%', v_ad, v_ad2, v_other;
  end if;

  insert into public.admin_flags (entity_type, entity_id, note, author_id, created_at) values
    ('ad',     v_ad,    'p3a harness flag 1', sa, now() - interval '2 minutes'),
    ('ad',     v_ad,    'p3a harness flag 2', sa, now() - interval '1 minute'),
    ('vendor', v_owner, 'p3a harness flag 3', sa, now());

  fixtures := 'fixtures: ad=' || left(v_ad::text, 8) || ' (log rows=' || (select count(*) from public.ad_review_log where ad_id = v_ad)
           || ', owner=' || left(v_owner::text, 8) || ' owner_is_admin=' || exists(select 1 from admin.admin_users u where u.id = v_owner and u.is_active)
           || ') ad2=' || left(v_ad2::text, 8) || ' (log rows=' || (select count(*) from public.ad_review_log where ad_id = v_ad2)
           || ', owner=' || left(v_ad2_owner::text, 8) || ') other-vendor=' || left(v_other::text, 8)
           || ' buyer_owns_ad=' || (bu = v_owner) || ' buyer_owns_ad2=' || (bu = v_ad2_owner)
           || ' flags seeded=3';

  q_direct := array[
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(f.%s||''|''||coalesce(pr.full_name,'''')||''|''||coalesce(pr.email,''''), '';'' order by f.created_at desc, f.id desc)), 10), ''-'') from public.admin_flags f left join public.profiles pr on pr.id = f.author_id where f.entity_type = ''ad'' and f.entity_id = %L',
           replace(flag_cols, '||''|''||', '||''|''||f.'), v_ad),
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(s.k, '';'' order by s.created_at desc, s.id desc)), 10), ''-'') from (select f.id, f.created_at, f.%s||''|''||coalesce(pr.full_name,'''')||''|''||coalesce(pr.email,'''') as k from public.admin_flags f left join public.profiles pr on pr.id = f.author_id order by f.created_at desc, f.id desc limit 25) s',
           replace(flag_cols, '||''|''||', '||''|''||f.')),
    null, null,
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.ad_review_log where ad_id = %L', log_cols, v_ad),
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.ad_review_log where ad_id = %L', log_cols, v_ad2)
  ];
  q_rpc := array[
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s||''|''||coalesce(author_full_name,'''')||''|''||coalesce(author_email,''''), '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_flag_list(''ad'', %L)', flag_cols, v_ad),
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s||''|''||coalesce(author_full_name,'''')||''|''||coalesce(author_email,''''), '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_flag_list(null, null, 25)', flag_cols),
    null, null,
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_ad_review_log_list(%L)', log_cols, v_ad),
    format('select count(*)::text||'':''||coalesce(left(md5(string_agg(%s, '';'' order by created_at desc, id desc)), 10), ''-'') from public.admin_ad_review_log_list(%L)', log_cols, v_ad2)
  ];

  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 1..6 loop
      begin
        if p = 'support(in-txn)' then
          update public.profiles set is_admin = true, admin_role = 'support' where id = bu;
        elsif p = 'ads_moderator(in-txn)' then
          update public.profiles set is_admin = true, admin_role = 'ads_moderator' where id = bu;
        end if;
        who := case p when 'super_admin' then sa when 'owner-vendor' then v_owner
                      when 'other-vendor' then v_other when 'anon' then null else bu end;
        if who is null then
          perform set_config('request.jwt.claims', '', true);
          perform set_config('request.jwt.claim.sub', '', true);
          set local role anon;
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', who::text, true);
          set local role authenticated;
        end if;

        -- direct query (its own rolled-back subtransaction)
        begin
          if i = 3 then
            execute format('insert into public.admin_flags (entity_type, entity_id, note, author_id) values (''ad'', %L, ''p3a harness add'', coalesce(auth.uid(), %L::uuid)) returning id::text||''|''||(author_id is not distinct from auth.uid())::text', v_ad, sa) into t;
            execute format('select count(*) from public.admin_flags where id = %L and author_id = auth.uid()', split_part(t, '|', 1)) into n;
            d := 'OK author_is_self=' || split_part(t, '|', 2) || ' persisted=' || n;
          elsif i = 4 then
            execute format('insert into public.admin_flags (entity_type, entity_id, note, author_id) values (''video'', %L, ''p3a bad type'', coalesce(auth.uid(), %L::uuid))', v_ad, sa);
            d := 'OK';
          else
            execute q_direct[i] into d;
          end if;
          raise exception using errcode = 'P0097', message = d;
        exception
          when sqlstate 'P0097' then d := sqlerrm;
          when others then d := 'ERR ' || sqlstate;
        end;

        -- RPC (its own rolled-back subtransaction)
        begin
          if i = 3 then
            execute format('select x.id::text||''|''||(x.author_id is not distinct from auth.uid())::text from public.admin_flag_add(''ad'', %L, ''p3a harness add'') x', v_ad) into t;
            execute format('select count(*) from public.admin_flags where id = %L and author_id = auth.uid()', split_part(t, '|', 1)) into n;
            r := 'OK author_is_self=' || split_part(t, '|', 2) || ' persisted=' || n;
          elsif i = 4 then
            execute format('select x.id::text from public.admin_flag_add(''video'', %L, ''p3a bad type'') x', v_ad) into t;
            r := 'OK';
          else
            execute q_rpc[i] into r;
          end if;
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
        out := out || ' | ' || checks[i] || ': direct=' || d || ' rpc=' || r || ' ' || verdict;
        raise exception using errcode = 'P0099';
      exception
        when sqlstate 'P0099' then null;
        when others then
          out := out || ' | ' || checks[i] || ': HARNESS ERROR ' || sqlstate || ' ' || sqlerrm;
          mismatches := mismatches + 1;
      end;
    end loop;
    out := out || E'\n';
  end loop;

  raise exception 'P3A RPC PARITY (rolled back) mismatches=% %', mismatches, E'\n' || fixtures || E'\n' || out;
end
$p3a$
