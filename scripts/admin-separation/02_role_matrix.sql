-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN-SCHEMA SEPARATION HARNESS 02 — role-vs-write matrix ("H2").
--
-- 4 personas × 8 admin-gated checks, each in its own rolled-back subtransaction:
--   super_admin      demo-admin 33333333-…
--   support(in-txn)  demo-buyer promoted to support inside the subtransaction by
--                    writing admin.admin_users directly (as postgres). Before Phase 5c
--                    this went through public.profiles and the mirror, which are gone.
--   buyer            demo-buyer 11111111-…
--   anon
-- Checks: R{su,sa} read, admin-only decision-history RPC, A write, R{sa} write,
-- R{sa,vo} write, panel-shaped promotion, self-escalation, admin-gated RPC.
--
-- CHANGED IN PHASE 3c (2026-09-16): check 2 was `select count(*) from
-- public.ad_review_log` as the persona — a direct table read that stops working
-- once the table is behind the admin wall. It now calls
-- admin_ad_review_log_list() for the campaign with the most history (resolved as
-- postgres, in whichever schema holds the log). None of these four personas owns
-- that campaign, so the Q-4 narrowing does not show here; the output is expected
-- to be identical before and after the move. The baseline below is the new one.
--
-- Historical baseline for the old check 2 (identical before 2a, after 2a and after 2b, 2026-09-15):
-- [super_admin] is_admin()=true admin_role()=super_admin | sel chat_block_reasons R{su,sa}=7 | sel ad_review_log owner|A=27 | upd categories A=1 | upd chat_block_reasons R{sa}=1 | upd vendor_profiles(other) R{sa,vo}=1 | promote other->support=1 | self->super_admin=1 | rpc regex_probe R{su,sa}=1
-- [support(in-txn)] is_admin()=true admin_role()=support | sel chat_block_reasons R{su,sa}=7 | sel ad_review_log owner|A=27 | upd categories A=1 | upd chat_block_reasons R{sa}=0 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support->42501 | self->super_admin->42501 | rpc regex_probe R{su,sa}=1
-- [buyer] is_admin()=false admin_role()=null | sel chat_block_reasons R{su,sa}=0 | sel ad_review_log owner|A=0 | upd categories A=0 | upd chat_block_reasons R{sa}=0 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support=0 | self->super_admin->42501 | rpc regex_probe R{su,sa}->42501
-- [anon] is_admin()=false admin_role()=null | sel chat_block_reasons R{su,sa}=0 | sel ad_review_log owner|A=0 | upd categories A=0 | upd chat_block_reasons R{sa}=0 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support=0 | self->super_admin=0 | rpc regex_probe R{su,sa}->42501
-- Counts depend on live data (chat_block_reasons=7, ad_review_log=27 at baseline).
--
-- CHANGED IN PHASE 4c (2026-09-21): checks 1 and 4 were a direct SELECT / UPDATE on
-- public.chat_block_reasons, which moved to admin.chat_block_reasons in 4c and is
-- unreachable by client roles. They now call the 4a RPCs that front the same
-- policies: check 1 = admin_block_reason_list() (S = support/super_admin), check 4 =
-- admin_block_reason_update(cbr) with no field changed (SA = super_admin), the
-- no-op equivalent of the old `set id = id`. Allowed cells are unchanged (7 / 1);
-- a denied cell that used to read 0 rows now reads ->42501 (the RPC refuses instead
-- of RLS filtering), exactly the 4a DENIED-BOTH relation. New baseline (2026-09-21, post-4c):
-- [super_admin] is_admin()=true admin_role()=super_admin | rpc chat_block_reasons list S=7 | rpc admin_ad_review_log_list A=2 | upd categories A=1 | rpc chat_block_reasons update SA=1 | upd vendor_profiles(other) R{sa,vo}=1 | promote other->support=1 | self->super_admin=1 | rpc regex_probe R{su,sa}=1
-- [support(in-txn)] is_admin()=true admin_role()=support | rpc chat_block_reasons list S=7 | rpc admin_ad_review_log_list A=2 | upd categories A=1 | rpc chat_block_reasons update SA->42501 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support->42501 | self->super_admin->42501 | rpc regex_probe R{su,sa}=1
-- [buyer] is_admin()=false admin_role()=null | rpc chat_block_reasons list S->42501 | rpc admin_ad_review_log_list A->42501 | upd categories A=0 | rpc chat_block_reasons update SA->42501 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support=0 | self->super_admin->42501 | rpc regex_probe R{su,sa}->42501
-- [anon] is_admin()=false admin_role()=null | rpc chat_block_reasons list S->42501 | rpc admin_ad_review_log_list A->42501 | upd categories A=0 | rpc chat_block_reasons update SA->42501 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support=0 | self->super_admin=0 | rpc regex_probe R{su,sa}->42501
--
-- CHANGED IN PHASE 5c (2026-09-22): profiles.is_admin / profiles.admin_role are dropped.
-- The support(in-txn) persona is now promoted by inserting into admin.admin_users (as
-- postgres, inside the rolled-back subtransaction), and checks 6 and 7 — which were a
-- panel-shaped promotion and a self-escalation through those columns — call the write
-- RPCs that replaced them: admin_grant(other, 'support') and
-- admin_set_role(auth.uid(), 'super_admin'). Both are gated on super_admin OR
-- service_role and RAISE 42501 for anyone else, where the old column UPDATE was
-- refused by enforce_admin_grants (support) or silently matched 0 rows (buyer/anon).
-- So two cells legitimately change shape: buyer/anon "promote other->support" and anon
-- "self->super_admin" go from =0 to ->42501. New baseline (2026-09-22, post-5c):
-- [super_admin] is_admin()=true admin_role()=super_admin | rpc chat_block_reasons list S=7 | rpc admin_ad_review_log_list A=2 | upd categories A=1 | rpc chat_block_reasons update SA=1 | upd vendor_profiles(other) R{sa,vo}=1 | promote other->support=1 | self->super_admin=1 | rpc regex_probe R{su,sa}=1
-- [support(in-txn)] is_admin()=true admin_role()=support | rpc chat_block_reasons list S=7 | rpc admin_ad_review_log_list A=2 | upd categories A=1 | rpc chat_block_reasons update SA->42501 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support->42501 | self->super_admin->42501 | rpc regex_probe R{su,sa}=1
-- [buyer] is_admin()=false admin_role()=null | rpc chat_block_reasons list S->42501 | rpc admin_ad_review_log_list A->42501 | upd categories A=0 | rpc chat_block_reasons update SA->42501 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support->42501 | self->super_admin->42501 | rpc regex_probe R{su,sa}->42501
-- [anon] is_admin()=false admin_role()=null | rpc chat_block_reasons list S->42501 | rpc admin_ad_review_log_list A->42501 | upd categories A=0 | rpc chat_block_reasons update SA->42501 | upd vendor_profiles(other) R{sa,vo}=0 | promote other->support->42501 | self->super_admin->42501 | rpc regex_probe R{su,sa}->42501
-- Confirmed live on 2026-09-22 after the drop: every other cell is identical to the
-- post-4c baseline above.
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
  logad uuid;
  personas text[] := array['super_admin', 'support(in-txn)', 'buyer', 'anon'];
  labels text[] := array['rpc chat_block_reasons list S', 'rpc admin_ad_review_log_list A', 'upd categories A', 'rpc chat_block_reasons update SA', 'upd vendor_profiles(other) R{sa,vo}', 'promote other->support', 'self->super_admin', 'rpc regex_probe R{su,sa}'];
  p text; who uuid; n int; i int; t text; out text := '';
begin
  select id into vp from public.vendor_profiles where id <> bu order by id limit 1;
  execute format('select ad_id from %s group by ad_id order by count(*) desc, ad_id limit 1',
                 coalesce(to_regclass('admin.ad_review_log'), to_regclass('public.ad_review_log'))) into logad;
  foreach p in array personas loop
    out := out || '[' || p || ']';
    for i in 0..8 loop
      begin
        if p = 'support(in-txn)' then
          insert into admin.admin_users (id, admin_role, is_active) values (bu, 'support', true)
          on conflict (id) do update set admin_role = excluded.admin_role, is_active = true;
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
        elsif i = 1 then execute 'select count(*) from (select x.id from public.admin_block_reason_list() x) s' into n;
        elsif i = 2 then execute format('select count(*) from (select x.id from public.admin_ad_review_log_list(%L) x) s', logad) into n;
        elsif i = 3 then execute format('update public.categories set id = id where id = %L', cat); get diagnostics n = row_count;
        elsif i = 4 then execute format('select count(*) from (select x.id from public.admin_block_reason_update(%L) x) s', cbr) into n;
        elsif i = 5 then execute format('update public.vendor_profiles set id = id where id = %L', vp); get diagnostics n = row_count;
        elsif i = 6 then execute format('select count(*) from (select x.id from public.admin_grant(%L, ''support'') x) s', vp) into n;
        elsif i = 7 then execute 'select count(*) from (select x.id from public.admin_set_role(auth.uid(), ''super_admin'') x) s' into n;
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
