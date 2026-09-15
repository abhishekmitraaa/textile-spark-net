-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 02 — role-vs-write matrix ("H2").
--
-- 4 personas × 8 admin-gated checks, each in its own rolled-back subtransaction:
--   super_admin      demo-admin 33333333-…
--   support(in-txn)  demo-buyer promoted to support inside the subtransaction,
--                    THROUGH public.profiles (so after Phase 2b it also exercises
--                    the profiles → admin.admin_users mirror)
--   buyer            demo-buyer 11111111-…
--   anon
-- Checks: R{su,sa} read, owner-or-admin read, A write, R{sa} write, R{sa,vo}
-- write, panel-shaped promotion, self-escalation, admin-gated RPC.
--
-- Baseline (identical before Phase 2a, after 2a and after 2b, 2026-09-15):
-- [super_admin] is_admin()=true admin_role()=super_admin | sel chat_block_reasons R{su,sa}=7 | sel ad_review_log owner|A=27 | upd categories A=1 | upd chat_block_reasons R{sa}=1 | upd vendor_profiles(other) R{sa,vo}=1 | promote other->support=1 | self->super_admin=1 | rpc regex_probe R{su,sa}=1
-- [support(in-txn)] is_admin()=true admin_role()=support | sel chat_block_reasons R{su,sa}=7 | sel ad_review_log owner|A=27 | upd categories A=1 | upd chat_block_reasons R{sa}=0 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support->42501 | self->super_admin->42501 | rpc regex_probe R{su,sa}=1
-- [buyer] is_admin()=false admin_role()=null | sel chat_block_reasons R{su,sa}=0 | sel ad_review_log owner|A=0 | upd categories A=0 | upd chat_block_reasons R{sa}=0 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support=0 | self->super_admin->42501 | rpc regex_probe R{su,sa}->42501
-- [anon] is_admin()=false admin_role()=null | sel chat_block_reasons R{su,sa}=0 | sel ad_review_log owner|A=0 | upd categories A=0 | upd chat_block_reasons R{sa}=0 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support=0 | self->super_admin=0 | rpc regex_probe R{su,sa}->42501
-- Counts depend on live data (chat_block_reasons=7, ad_review_log=27 at baseline).
--
-- Pitfall already hit once: never probe an RPC as `count(*) from (select rpc()) s`
-- — the planner drops the unused column and the function is never called.
--
-- HOW TO RUN: execute this whole file as ONE statement. It never commits.
-- ─────────────────────────────────────────────────────────────────────────────
do $h2$
declare
  sa  uuid := '33333333-3333-3333-3333-333333333333';
  bu  uuid := '11111111-1111-1111-1111-111111111111';
  cat uuid := '002afffc-968f-4d65-8cf1-bf2ec10c1650';
  cbr uuid := '4c163844-dcf9-4416-a6d1-fb5d40fa10d9';
  vp  uuid;
  personas text[] := array['super_admin', 'support(in-txn)', 'buyer', 'anon'];
  labels text[] := array['sel chat_block_reasons R{su,sa}', 'sel ad_review_log owner|A', 'upd categories A', 'upd chat_block_reasons R{sa}', 'upd vendor_profiles(other) R{sa,vo}', 'promote other->support', 'self->super_admin', 'rpc regex_probe R{su,sa}'];
  p text; who uuid; n int; i int; t text; out text := '';
begin
  select id into vp from public.vendor_profiles where id <> bu order by id limit 1;
  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 0..8 loop
      begin
        if p = 'support(in-txn)' then
          update public.profiles set is_admin = true, admin_role = 'support' where id = bu;
        end if;
        who := case p when 'super_admin' then sa when 'anon' then null else bu end;
        if who is null then
          perform set_config('request.jwt.claims', '', true);
          perform set_config('request.jwt.claim.sub', '', true);
          set local role anon;
        else
          perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
          perform set_config('request.jwt.claim.sub', who::text, true);
          set local role authenticated;
        end if;
        if i = 0 then
          out := out || ' is_admin()=' || public.is_admin() || ' admin_role()=' || coalesce(public.admin_role()::text, 'null');
          raise exception using errcode = 'P0098';
        elsif i = 1 then execute 'select count(*) from public.chat_block_reasons' into n;
        elsif i = 2 then execute 'select count(*) from public.ad_review_log' into n;
        elsif i = 3 then execute format('update public.categories set id = id where id = %L', cat); get diagnostics n = row_count;
        elsif i = 4 then execute format('update public.chat_block_reasons set id = id where id = %L', cbr); get diagnostics n = row_count;
        elsif i = 5 then execute format('update public.vendor_profiles set id = id where id = %L', vp); get diagnostics n = row_count;
        elsif i = 6 then execute format('update public.profiles set is_admin = true, admin_role = %L where id = %L', 'support', vp); get diagnostics n = row_count;
        elsif i = 7 then execute 'update public.profiles set is_admin = true, admin_role = ''super_admin'' where id = auth.uid()'; get diagnostics n = row_count;
        elsif i = 8 then execute 'select public.regex_probe(''a'', ''a'')::text' into t; n := 1;
        end if;
        raise exception using errcode = 'P0099', message = n::text;
      exception
        when sqlstate 'P0098' then null;
        when sqlstate 'P0099' then out := out || ' | ' || labels[i] || '=' || sqlerrm;
        when others then out := out || ' | ' || labels[i] || '->' || sqlstate;
      end;
    end loop;
    out := out || E'\n';
  end loop;
  raise exception 'H2 (rolled back)%', E'\n' || out;
end
$h2$
