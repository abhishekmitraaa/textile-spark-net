-- FAQ snapshots on the Storage CDN (Phase 23 of the My Profile brief, 2026-09-24;
-- Phase 9's open question 2: the FAQ read path at 10k concurrent users).
--
-- public.faqs is ~30 rows and indexed, so the table was never the limit. PostgREST
-- is: its pool is ~10 connections, and the 2026-09-23 k6 run peaked at ~128 req/s
-- (p95 ~610 ms) across the app's queries. Every buyer Help, /seller and
-- /subscription page load spent one of those requests on content that changes a
-- few times a month. After this migration those pages read a static JSON file per
-- surface from a public Storage bucket, cached by the CDN, and fall back to the
-- table if the file can't be fetched or doesn't parse (src/lib/queries/faqs.ts).
--
--   faq-snapshots/buyer_help.json, seller_registration.json, subscription.json
--
-- WHO WRITES THE FILES: the `faqs-snapshot` edge function, and nothing else. It
-- reads the active rows with the anon key (so each file holds exactly what anyone
-- can already read, and never created_by) and uploads with the service-role key,
-- Cache-Control max-age=300. No storage.objects policy mentions this bucket, so no
-- client can write it. Admin writes are unchanged: still the admin_faq_* RPCs.
--
-- WHAT CALLS THE FUNCTION:
--   * trg_faqs_snapshot: after any statement that writes public.faqs, one pg_net
--     call per transaction. pg_net queues the request inside the transaction, so
--     a rolled-back write never regenerates and a committed one always queues.
--     It is best effort, like notify_embedding_alert_webhook: a cache refresh
--     never blocks or fails an admin's edit. Pages fall back to the table anyway.
--   * cron `faq-snapshots-refresh`, hourly at :17: rebuilds all three, so a lost
--     call can't leave a file stale for more than an hour, and seeds the files.
--     It RAISES if the Vault key is missing, so cron.job_run_details shows the
--     failure, instead of succeeding while doing nothing.
--
-- HOW STALE A PAGE CAN BE: on the Free plan the Storage CDN has no Smart CDN
-- invalidation and can't be purged (both Pro only), so an overwritten file reaches
-- a fresh page load within max-age = 5 minutes, plus a second or two to rebuild.
-- A tab already open holds its copy for useFaqs' 10-minute staleTime.

-- ── Bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faq-snapshots', 'faq-snapshots', true, 65536, array['application/json'])
on conflict (id) do update
  set public = true, file_size_limit = 65536, allowed_mime_types = array['application/json'];

-- ── Trigger: queue one rebuild per transaction ───────────────────────────────
create or replace function public.faqs_queue_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text;
begin
  -- admin_faq_reorder writes twice in one transaction; one rebuild is enough.
  -- A transaction-local setting, so the next transaction queues again.
  if coalesce(current_setting('cosora.faqs_snapshot_queued', true), '') = 'on' then
    return null;
  end if;
  perform set_config('cosora.faqs_snapshot_queued', 'on', true);

  begin
    select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'service_role_key';
    if v_key is null then
      raise warning 'faqs snapshot not queued: Vault secret service_role_key is missing';
      return null;
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/faqs-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('reason', 'faqs ' || lower(tg_op)),
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never fail the admin's write over the cache. The hourly job catches up.
    raise warning 'faqs snapshot not queued: %', sqlerrm;
  end;
  return null;
end
$function$;

revoke all on function public.faqs_queue_snapshot() from public, anon, authenticated, service_role;

drop trigger if exists trg_faqs_snapshot on public.faqs;
create trigger trg_faqs_snapshot
  after insert or update or delete or truncate on public.faqs
  for each statement execute function public.faqs_queue_snapshot();

-- ── Cron: hourly rebuild, and the first one ──────────────────────────────────
select cron.unschedule('faq-snapshots-refresh')
 where exists (select 1 from cron.job where jobname = 'faq-snapshots-refresh');

select cron.schedule(
  'faq-snapshots-refresh',
  '17 * * * *',
  $job$
  do $do$
  declare
    v_key text;
  begin
    select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
    if v_key is null then
      raise exception 'faq-snapshots-refresh: Vault secret service_role_key is missing, so the FAQ snapshots can''t be rebuilt';
    end if;
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/faqs-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := '{"reason":"cron"}'::jsonb,
      timeout_milliseconds := 30000
    );
  end
  $do$;
  $job$
);

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  pol record;
begin
  if not exists (select 1 from storage.buckets
                  where id = 'faq-snapshots' and public and file_size_limit = 65536
                    and allowed_mime_types = array['application/json']) then
    raise exception 'self-check: faq-snapshots bucket is missing or misconfigured';
  end if;

  -- No client may write the bucket: no policy names it, and every write policy on
  -- storage.objects is pinned to some other bucket.
  for pol in select policyname, cmd, coalesce(with_check, qual) as expr
             from pg_policies where schemaname = 'storage' and tablename = 'objects' loop
    if pol.expr like '%faq-snapshots%' then
      raise exception 'self-check: storage policy % mentions faq-snapshots', pol.policyname;
    end if;
    if pol.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and pol.expr not like '%bucket_id = ''%' then
      raise exception 'self-check: storage write policy % is not pinned to a bucket', pol.policyname;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.faqs'::regclass and tgname = 'trg_faqs_snapshot' and tgenabled = 'O') then
    raise exception 'self-check: trg_faqs_snapshot is missing or disabled';
  end if;
  if not (select p.prosecdef and p.proconfig = array['search_path=""']
            from pg_proc p where p.oid = 'public.faqs_queue_snapshot()'::regprocedure) then
    raise exception 'self-check: faqs_queue_snapshot is not SECURITY DEFINER with search_path pinned';
  end if;
  if has_function_privilege('anon', 'public.faqs_queue_snapshot()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.faqs_queue_snapshot()', 'EXECUTE') then
    raise exception 'self-check: a client role can execute faqs_queue_snapshot';
  end if;
  if not exists (select 1 from cron.job where jobname = 'faq-snapshots-refresh' and schedule = '17 * * * *' and active) then
    raise exception 'self-check: the faq-snapshots-refresh cron job is missing';
  end if;
end
$check$;
