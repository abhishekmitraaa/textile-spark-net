-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN SCHEMA SEPARATION — PHASE 4c: MOVE THE CHAT-MODERATION AND SUSPENSION
-- TABLES BEHIND THE ADMIN WALL.
--
-- Spec: documentation/admin-separation-spec.md. Rolling context:
-- documentation/admin-separation-context.md.
--
-- 4a added SECURITY DEFINER RPCs over these five tables; 4b moved the panel onto
-- them (deployed: cosora-admin.vercel.app bundle index--JJm6wRt.js makes 0
-- requests to the tables, verified 2026-09-21 before this ran). This migration:
--   1. Moves keyword_blocklist, flag_patterns, chat_block_reasons,
--      conversation_reviews and account_suspensions into `admin`
--      (SET SCHEMA is a move: rows, indexes, constraints, RLS policies and FKs
--      travel with the table; FKs bind by OID, so the references into
--      public.profiles / conversations / messages simply become cross-schema).
--   2. Repoints the 17 function bodies that name them. There are exactly 17
--      (Step 0, live): 5 legacy SECURITY DEFINER functions
--        check_message_blocklist()          keyword_blocklist        (messages trigger)
--        check_message_flag_patterns()      flag_patterns, conversation_reviews (messages trigger)
--        resolve_conversation_review(...)   conversation_reviews
--        set_account_status(...)            account_suspensions
--        submit_report(...)                 conversation_reviews
--      and the 12 Phase 4a RPCs (admin_keyword_*, admin_flag_pattern_*,
--      admin_block_reason_*, admin_conversation_review_list,
--      admin_account_suspension_list). regex_probe is NOT repointed: it reads no
--      table (its only mention is `check_message_flag_patterns` in a comment).
--      No view, column default, cron job, publication or other table's policy
--      references the five.
--
--      The repoint is a pure name substitution, applied in-database to the live
--      definition: every `public.<one of the five>` becomes `admin.<same>`, and
--      nothing else changes. Every body already schema-qualifies these names, so
--      the substitution is complete; search_path settings are untouched (the 5
--      legacy functions keep their pinned `search_path=public`, the 12 RPCs
--      keep `search_path=''`). Owner, ACL and COMMENT survive CREATE OR REPLACE.
--      Guarded both ways:
--        before — each of the 17 definitions must md5-match what Step 0 inspected,
--                 so the substitution is applied to known text only;
--        after  — reversing the substitution must reproduce each pre-move md5, so
--                 no body differs beyond the repoint.
--   3. Revokes the residual client grants that travelled with the tables
--      (anon and authenticated held ALL on all five). RLS stays enabled with its
--      policies, as defence in depth. `admin` has no USAGE for any client role.
--   4. Asserts the end state; any failure aborts the whole migration.
--
-- After this the public app's key cannot reach any of the five tables; the
-- SECURITY DEFINER functions (owner postgres) still can, so messaging, reports,
-- review resolution and suspensions keep working.
--
-- ── ROLLBACK (manual, one transaction) ──────────────────────────────────────
--   begin;
--   alter table admin.keyword_blocklist    set schema public;
--   alter table admin.flag_patterns        set schema public;
--   alter table admin.chat_block_reasons   set schema public;
--   alter table admin.conversation_reviews set schema public;
--   alter table admin.account_suspensions  set schema public;
--   do $rb$
--   declare f text;
--   begin
--     foreach f in array array[
--       'public.check_message_blocklist()', 'public.check_message_flag_patterns()',
--       'public.resolve_conversation_review(uuid,text,uuid,boolean)',
--       'public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)',
--       'public.submit_report(uuid,uuid,text)',
--       'public.admin_keyword_list()', 'public.admin_keyword_add(text)', 'public.admin_keyword_remove(uuid)',
--       'public.admin_flag_pattern_list()', 'public.admin_flag_pattern_add(text,text,boolean)',
--       'public.admin_flag_pattern_update(uuid,boolean)', 'public.admin_flag_pattern_remove(uuid)',
--       'public.admin_block_reason_list(boolean)', 'public.admin_block_reason_add(text)',
--       'public.admin_block_reason_update(uuid,text,boolean)',
--       'public.admin_conversation_review_list(text,uuid)',
--       'public.admin_account_suspension_list(uuid[],boolean)'
--     ] loop
--       execute regexp_replace(pg_get_functiondef(f::regprocedure),
--         '\madmin\.(keyword_blocklist|flag_patterns|chat_block_reasons|conversation_reviews|account_suspensions)\M',
--         'public.\1', 'g');
--     end loop;
--   end $rb$;
--   grant all on public.keyword_blocklist, public.flag_patterns, public.chat_block_reasons,
--                public.conversation_reviews, public.account_suspensions to anon, authenticated;
--   commit;
-- (Each reverted body then md5-matches the pre-move value listed in step 0.)
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_get_functiondef() renders type and object names relative to search_path, and
-- the md5 guards below compare its output; pin it for this transaction so the text
-- is the same as when Step 0 took the md5s (public visible).
set local search_path = public;

-- 0. Pre-state guard: the tables are where Step 0 saw them, and the 17 bodies
--    are exactly the text Step 0 inspected.
do $pre$
declare
  v_bad text;
begin
  select string_agg(n, ', ') into v_bad
    from unnest(array['keyword_blocklist','flag_patterns','chat_block_reasons','conversation_reviews','account_suspensions']) n
   where to_regclass('public.' || n) is null or to_regclass('admin.' || n) is not null;
  if v_bad is not null then
    raise exception 'Phase 4c aborted: not in public (or already in admin): %', v_bad;
  end if;

  select string_agg(fn, ', ') into v_bad
    from (values
      ('public.check_message_blocklist()',                                   '64df0233551775884a893b3808543a93'),
      ('public.check_message_flag_patterns()',                               'f1a2a9828026afd25019ad2cd2900612'),
      ('public.resolve_conversation_review(uuid,text,uuid,boolean)',         '24b5b4d9a8960a9e73295c5f6160aaa8'),
      ('public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)', '3212ea0ee61c5f1ae8d4f78d087cee80'),
      ('public.submit_report(uuid,uuid,text)',                               '8ca1e84aaf872b94dac696f4a4433ca0'),
      ('public.admin_keyword_list()',                                        '65f9d2ec7f7c132fae56a26d306c14bd'),
      ('public.admin_keyword_add(text)',                                     'b9c668ab11e0c110c6d5dffa5af44c24'),
      ('public.admin_keyword_remove(uuid)',                                  'd26ca3cfaae558eb115aa8010c333611'),
      ('public.admin_flag_pattern_list()',                                   'a95cdf9f17119e7b21c8c36adc333ce7'),
      ('public.admin_flag_pattern_add(text,text,boolean)',                   'ee695061886809b93d9f13ea6f144f7f'),
      ('public.admin_flag_pattern_update(uuid,boolean)',                     'da2d0204bff73575f86fcce7703e8778'),
      ('public.admin_flag_pattern_remove(uuid)',                             '71aa5fddeb361bdc85f09f3031ba5708'),
      ('public.admin_block_reason_list(boolean)',                            'edc0377040c7c4faa6412ff05c2f7a8a'),
      ('public.admin_block_reason_add(text)',                                '8c50ca3004edcb9e67a686b33be29f0c'),
      ('public.admin_block_reason_update(uuid,text,boolean)',                'f76934ac410e73c1232770520ef726c7'),
      ('public.admin_conversation_review_list(text,uuid)',                   '22f3681ea81c99771f50e5f93144638e'),
      ('public.admin_account_suspension_list(uuid[],boolean)',               '62e07f42f6bfdf88fc4c5d1f6c49ea19')
    ) v(fn, pre_md5)
   where md5(pg_get_functiondef(fn::regprocedure)) <> pre_md5;
  if v_bad is not null then
    raise exception 'Phase 4c aborted: body changed since Step 0: %', v_bad;
  end if;

  -- No function outside the 17 names the tables (so none is left unrepointed).
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p
   where p.pronamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
     and p.prosrc ~ '\m(keyword_blocklist|flag_patterns|chat_block_reasons|conversation_reviews|account_suspensions)\M'
     and not (p.pronamespace = 'public'::regnamespace and p.proname in (
       'check_message_blocklist', 'check_message_flag_patterns', 'resolve_conversation_review',
       'set_account_status', 'submit_report',
       'admin_keyword_list', 'admin_keyword_add', 'admin_keyword_remove',
       'admin_flag_pattern_list', 'admin_flag_pattern_add', 'admin_flag_pattern_update', 'admin_flag_pattern_remove',
       'admin_block_reason_list', 'admin_block_reason_add', 'admin_block_reason_update',
       'admin_conversation_review_list', 'admin_account_suspension_list'));
  if v_bad is not null then
    raise exception 'Phase 4c aborted: unexpected function references the tables: %', v_bad;
  end if;
end
$pre$;

-- 1. Move the tables.
alter table public.keyword_blocklist    set schema admin;
alter table public.flag_patterns        set schema admin;
alter table public.chat_block_reasons   set schema admin;
alter table public.conversation_reviews set schema admin;
alter table public.account_suspensions  set schema admin;

-- 2. Repoint the 17 bodies: public.<table> → admin.<table>, nothing else.
do $repoint$
declare
  f text;
begin
  foreach f in array array[
    'public.check_message_blocklist()', 'public.check_message_flag_patterns()',
    'public.resolve_conversation_review(uuid,text,uuid,boolean)',
    'public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)',
    'public.submit_report(uuid,uuid,text)',
    'public.admin_keyword_list()', 'public.admin_keyword_add(text)', 'public.admin_keyword_remove(uuid)',
    'public.admin_flag_pattern_list()', 'public.admin_flag_pattern_add(text,text,boolean)',
    'public.admin_flag_pattern_update(uuid,boolean)', 'public.admin_flag_pattern_remove(uuid)',
    'public.admin_block_reason_list(boolean)', 'public.admin_block_reason_add(text)',
    'public.admin_block_reason_update(uuid,text,boolean)',
    'public.admin_conversation_review_list(text,uuid)',
    'public.admin_account_suspension_list(uuid[],boolean)'
  ] loop
    execute regexp_replace(pg_get_functiondef(f::regprocedure),
      '\mpublic\.(keyword_blocklist|flag_patterns|chat_block_reasons|conversation_reviews|account_suspensions)\M',
      'admin.\1', 'g');
  end loop;
end
$repoint$;

-- 3. Residual client grants that travelled with the tables.
revoke all on admin.keyword_blocklist    from anon, authenticated;
revoke all on admin.flag_patterns        from anon, authenticated;
revoke all on admin.chat_block_reasons   from anon, authenticated;
revoke all on admin.conversation_reviews from anon, authenticated;
revoke all on admin.account_suspensions  from anon, authenticated;

-- 4. Assert the end state; any failure aborts the whole migration.
do $post$
declare
  v_bad text;
  v_n   bigint;
begin
  select string_agg(n, ', ') into v_bad
    from unnest(array['keyword_blocklist','flag_patterns','chat_block_reasons','conversation_reviews','account_suspensions']) n
   where to_regclass('admin.' || n) is null or to_regclass('public.' || n) is not null;
  if v_bad is not null then
    raise exception 'Phase 4c aborted: not in admin (or still in public): %', v_bad;
  end if;

  -- Rows travelled (0 / 3 / 7 / 1 / 0 at Step 0; compared as a total per table set).
  select count(*) into v_n from admin.chat_block_reasons;
  if v_n <> 7 then raise exception 'Phase 4c aborted: chat_block_reasons has % rows, expected 7', v_n; end if;
  select count(*) into v_n from admin.flag_patterns;
  if v_n <> 3 then raise exception 'Phase 4c aborted: flag_patterns has % rows, expected 3', v_n; end if;
  select count(*) into v_n from admin.conversation_reviews;
  if v_n <> 1 then raise exception 'Phase 4c aborted: conversation_reviews has % rows, expected 1', v_n; end if;

  -- RLS still on, all 15 policies and all 13 FKs travelled.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c where c.relnamespace = 'admin'::regnamespace
     and c.relname in ('keyword_blocklist','flag_patterns','chat_block_reasons','conversation_reviews','account_suspensions')
     and not c.relrowsecurity;
  if v_bad is not null then raise exception 'Phase 4c aborted: RLS off on %', v_bad; end if;
  select count(*) into v_n from pg_policies where schemaname = 'admin'
     and tablename in ('keyword_blocklist','flag_patterns','chat_block_reasons','conversation_reviews','account_suspensions');
  if v_n <> 15 then raise exception 'Phase 4c aborted: % policies on the moved tables, expected 15', v_n; end if;
  select count(*) into v_n from pg_constraint where contype = 'f'
     and conrelid in ('admin.keyword_blocklist'::regclass, 'admin.flag_patterns'::regclass, 'admin.chat_block_reasons'::regclass,
                      'admin.conversation_reviews'::regclass, 'admin.account_suspensions'::regclass);
  if v_n <> 13 then raise exception 'Phase 4c aborted: % FKs on the moved tables, expected 13', v_n; end if;

  -- No client table privilege, no client USAGE on the schema.
  select string_agg(table_name || ':' || grantee, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema = 'admin' and grantee in ('anon', 'authenticated', 'PUBLIC')
     and table_name in ('keyword_blocklist','flag_patterns','chat_block_reasons','conversation_reviews','account_suspensions');
  if v_bad is not null then raise exception 'Phase 4c aborted: client role still holds a table privilege: %', v_bad; end if;
  if has_schema_privilege('anon', 'admin', 'USAGE') or has_schema_privilege('authenticated', 'admin', 'USAGE') then
    raise exception 'Phase 4c aborted: client USAGE on schema admin';
  end if;

  -- Nothing anywhere still names public.<table>.
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p
   where p.pronamespace not in ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
     and p.prosrc ~ '\mpublic\.(keyword_blocklist|flag_patterns|chat_block_reasons|conversation_reviews|account_suspensions)\M';
  if v_bad is not null then raise exception 'Phase 4c aborted: still referencing public.*: %', v_bad; end if;

  -- Each new body minus the substitution equals its pre-move md5 (also proves
  -- search_path, volatility and SECURITY DEFINER unchanged: they are in the def).
  select string_agg(fn, ', ') into v_bad
    from (values
      ('public.check_message_blocklist()',                                   '64df0233551775884a893b3808543a93'),
      ('public.check_message_flag_patterns()',                               'f1a2a9828026afd25019ad2cd2900612'),
      ('public.resolve_conversation_review(uuid,text,uuid,boolean)',         '24b5b4d9a8960a9e73295c5f6160aaa8'),
      ('public.set_account_status(uuid,public.account_status_type,uuid,text,uuid)', '3212ea0ee61c5f1ae8d4f78d087cee80'),
      ('public.submit_report(uuid,uuid,text)',                               '8ca1e84aaf872b94dac696f4a4433ca0'),
      ('public.admin_keyword_list()',                                        '65f9d2ec7f7c132fae56a26d306c14bd'),
      ('public.admin_keyword_add(text)',                                     'b9c668ab11e0c110c6d5dffa5af44c24'),
      ('public.admin_keyword_remove(uuid)',                                  'd26ca3cfaae558eb115aa8010c333611'),
      ('public.admin_flag_pattern_list()',                                   'a95cdf9f17119e7b21c8c36adc333ce7'),
      ('public.admin_flag_pattern_add(text,text,boolean)',                   'ee695061886809b93d9f13ea6f144f7f'),
      ('public.admin_flag_pattern_update(uuid,boolean)',                     'da2d0204bff73575f86fcce7703e8778'),
      ('public.admin_flag_pattern_remove(uuid)',                             '71aa5fddeb361bdc85f09f3031ba5708'),
      ('public.admin_block_reason_list(boolean)',                            'edc0377040c7c4faa6412ff05c2f7a8a'),
      ('public.admin_block_reason_add(text)',                                '8c50ca3004edcb9e67a686b33be29f0c'),
      ('public.admin_block_reason_update(uuid,text,boolean)',                'f76934ac410e73c1232770520ef726c7'),
      ('public.admin_conversation_review_list(text,uuid)',                   '22f3681ea81c99771f50e5f93144638e'),
      ('public.admin_account_suspension_list(uuid[],boolean)',               '62e07f42f6bfdf88fc4c5d1f6c49ea19')
    ) v(fn, pre_md5)
   where md5(regexp_replace(pg_get_functiondef(fn::regprocedure),
               '\madmin\.(keyword_blocklist|flag_patterns|chat_block_reasons|conversation_reviews|account_suspensions)\M',
               'public.\1', 'g')) <> pre_md5
      or pg_get_functiondef(fn::regprocedure) !~ '\madmin\.(keyword_blocklist|flag_patterns|chat_block_reasons|conversation_reviews|account_suspensions)\M';
  if v_bad is not null then
    raise exception 'Phase 4c aborted: body differs from pre-move beyond the schema repoint (or was not repointed): %', v_bad;
  end if;
end
$post$;
