-- Security review, 2026-10-01: the open flag "33 SECURITY DEFINER functions in
-- public keep EXECUTE for anon" (securityflags.md, 2026-09-30).
--
-- Eleven of them are trigger or event-trigger functions. A client can't call
-- them (Postgres refuses: "trigger functions can only be called as triggers"),
-- and a trigger fires without checking EXECUTE: Postgres checks it only when
-- CREATE TRIGGER runs. So these grants do nothing except put the functions on
-- the advisor's list. Revoked from public, anon and authenticated; postgres and
-- service_role keep EXECUTE. Behaviour is unchanged. The other 22 functions on
-- the list are reviewed in securityflags.md and keep their grants: public read
-- paths, the counters, and helpers that RLS policies written TO public call.

do $revoke$
declare
  f regprocedure;
begin
  foreach f in array array[
    'public.check_message_blocklist()',
    'public.check_message_flag_patterns()',
    'public.create_certificate_order()',
    'public.guard_ad_activation()',
    'public.log_ad_submission()',
    'public.sync_product_rating()',
    'public.sync_vendor_rating()',
    'public.sync_video_likes_count()',
    'public.vendor_contracts_skip_duplicate_version()',
    'public.vendor_documents_guard_review_columns()',
    'public.rls_auto_enable()'
  ]::regprocedure[]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end
$revoke$;

-- Self-check: no trigger or event-trigger function in public is executable by
-- anon or authenticated, and service_role still is.
do $check$
declare
  bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by 1) into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
    and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if bad is not null then
    raise exception 'trigger functions still executable by a client role: %', bad;
  end if;

  if not has_function_privilege('service_role', 'public.sync_video_likes_count()'::regprocedure, 'EXECUTE') then
    raise exception 'service_role lost EXECUTE on the trigger functions';
  end if;
end
$check$;
