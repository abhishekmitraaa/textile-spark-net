-- Get embedding-pipeline health in front of the people who would act on it.
--
-- ── What was actually checked first (Master Prompt 7, item 2a) ─────────────
-- * Cosora-Admin has NO notifications surface. 23 pages (Accounts, Ads, Chats,
--   Products, Vendors, Videos, Reports, …) and not one reads `notifications`;
--   the only matches for "notification" in that repo are the auto-generated
--   database.types.ts and a dev seed. There is no bell, no inbox, no
--   system-health view.
-- * The alerts ARE already reachable — in the wrong app. The main buyer/vendor
--   app's /notifications page selects every kind without filtering, its RLS is
--   `profile_id = auth.uid()`, and unknown kinds fall through to FALLBACK_META
--   and render as a neutral "system" item. So an admin who signs into the
--   BUYER app sees them. Admins do not work there, which is why this exists.
-- * Zero `kind='system'` rows exist today. That is correct, not a gap: the
--   notifier only fires on a TRANSITION into a non-OK state and the pipeline
--   has been healthy since the alerting was added.
--
-- ── 2b: a read path Cosora-Admin can actually use ──────────────────────────
-- `embedding_pipeline_health_log` is service_role-only (RLS on, no policies,
-- no grants), which is right for a table nothing should write from a browser —
-- but it also means the admin app cannot read it. Rather than widening the
-- table's grants, this exposes one SECURITY DEFINER reader with the same
-- internal `is_admin()` guard the moderation verbs use, granted to
-- `authenticated` only.
--
-- Roles: super_admin and vendor_ops. This is infrastructure health, not
-- moderation or finance — vendor_ops already carries the operational sections
-- (geography, vendors) in the admin app's roles.ts, and support/finance/ads
-- moderators have no action to take on a stalled embedding queue.

create or replace function public.admin_embedding_pipeline_health(p_limit integer default 60)
returns table (
  checked_at       timestamptz,
  status           text,
  reason           text,
  queue_depth      integer,
  products_missing integer,
  rfqs_missing     integer,
  videos_missing   integer,
  vault_secret_ok  boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'not authorized: viewing pipeline health requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;

  return query
  select h.checked_at, h.status, h.reason, h.queue_depth,
         h.products_missing, h.rfqs_missing, h.videos_missing, h.vault_secret_ok
  from public.embedding_pipeline_health_log h
  order by h.checked_at desc
  limit greatest(coalesce(p_limit, 60), 1);
end
$function$;

comment on function public.admin_embedding_pipeline_health(integer) is
  'Recent embedding_pipeline_health_log samples for the admin app. super_admin/vendor_ops only; the log table itself stays service_role-only.';

revoke execute on function public.admin_embedding_pipeline_health(integer) from public, anon;
grant execute on function public.admin_embedding_pipeline_health(integer) to authenticated;

-- ── 2c: a way out of the app entirely, for CRITICAL only ───────────────────
-- There is no email sender, Slack app or webhook integration anywhere in this
-- project, and building one speculatively is out of scope. What IS available
-- for free is pg_net, which already carries the embedding worker's HTTP calls.
--
-- So: an OPTIONAL outbound POST, off by default. The URL lives in Vault under
-- `embedding_alert_webhook_url`. While that secret does not exist this is
-- inert — no call, no error, no behaviour change — and an admin can turn it on
-- later by creating the secret with any URL that accepts a JSON POST (Slack
-- incoming webhook, Discord, a PagerDuty Events v2 endpoint, an internal
-- receiver). Nothing needs redeploying to enable it.
--
-- CRITICAL only, deliberately. WARN is the state a transient backlog produces
-- and paging on it is how an alert channel gets muted; CRITICAL is
-- "the pipeline is not working". Same reasoning as notifying on transition
-- rather than on every sample.
--
-- Fire-and-forget by design: net.http_post queues the request and returns, so
-- a dead webhook cannot slow or fail the health check that called it. The
-- exception handler is belt-and-braces on top of that — an alerting path must
-- never be able to break the thing it is watching.

create or replace function public.notify_embedding_alert_webhook(
  p_status text,
  p_reason text,
  p_queue_depth integer default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_url text;
begin
  -- CRITICAL only. WARN stays in-app.
  if coalesce(p_status, '') <> 'CRITICAL' then
    return false;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'embedding_alert_webhook_url';

  -- Not configured is the normal state, not an error.
  if v_url is null or length(trim(v_url)) = 0 then
    return false;
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'text', 'Cosora embedding pipeline ' || p_status || ': ' || coalesce(p_reason, 'no reason reported')
                  || ' (queue depth ' || coalesce(p_queue_depth, 0) || ')',
        'status', p_status,
        'reason', p_reason,
        'queue_depth', coalesce(p_queue_depth, 0),
        'source', 'embedding_pipeline_health',
        'at', now()
      )
    );
  exception when others then
    -- Never let the alerting path break the health check that called it.
    return false;
  end;

  return true;
end
$function$;

comment on function public.notify_embedding_alert_webhook(text, text, integer) is
  'Fire-and-forget POST to the Vault secret `embedding_alert_webhook_url`, CRITICAL status only. Inert while that secret does not exist — this is the opt-in, no-redeploy way to get an alert out of the app. service_role only.';

revoke execute on function public.notify_embedding_alert_webhook(text, text, integer) from public, anon, authenticated;
grant execute on function public.notify_embedding_alert_webhook(text, text, integer) to service_role;

-- Call it from the recorder, on the same transition edge that notifies admins.
create or replace function public.record_embedding_pipeline_health()
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  h          record;
  v_previous text;
begin
  select * into h from public.embedding_pipeline_health();

  select status into v_previous
  from public.embedding_pipeline_health_log
  order by checked_at desc limit 1;

  insert into public.embedding_pipeline_health_log
    (status, reason, queue_depth, products_missing, rfqs_missing, videos_missing, vault_secret_ok)
  values
    (h.status, h.reason, h.queue_depth, h.products_missing, h.rfqs_missing, h.videos_missing, h.vault_secret_ok);

  -- Notify admins on the TRANSITION into a bad state, not on every subsequent
  -- check. A 3-day outage should produce one notification, not 432 — an alert
  -- channel that floods is an alert channel people mute, which would reproduce
  -- the original failure with extra steps.
  if h.status <> 'OK' and (v_previous is null or v_previous = 'OK') then
    insert into public.notifications (profile_id, kind, title, body)
    select p.id,
           'system',
           'Embedding pipeline: ' || h.status,
           coalesce(h.reason, 'no reason reported')
             || ' (queue ' || coalesce(h.queue_depth, 0)
             || ', missing: ' || coalesce(h.products_missing, 0) || ' products / '
             || coalesce(h.rfqs_missing, 0) || ' RFQs / '
             || coalesce(h.videos_missing, 0) || ' videos)'
    from public.profiles p
    where p.is_admin;

    -- Same edge, but this one can leave the building. No-op unless the Vault
    -- secret exists, and CRITICAL-only inside the callee.
    perform public.notify_embedding_alert_webhook(h.status, h.reason, h.queue_depth);
  end if;

  -- Keep 90 days. This is a 10-minute heartbeat, so that is ~13k rows.
  delete from public.embedding_pipeline_health_log
  where checked_at < now() - interval '90 days';

  return h.status;
end
$function$;
