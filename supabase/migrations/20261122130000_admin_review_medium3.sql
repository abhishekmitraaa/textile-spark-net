-- Cosora-Admin review 2026-11-22, Medium batch 3 (AR-M42 to AR-M46). Applies after 20261122120000.

-- ── AR-M42 A video goes live only with a file, and within 60 seconds ─────────────────────────────────────────────
-- Approve (one video) and the per-seller bulk approve put a video live with no file at all, or longer than the 60-second
-- cap the upload enforces. The check is on the move to live, so videos already live are left as they are.
create or replace function admin.video_live_requirements()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    if nullif(btrim(coalesce(new.video_url, '')), '') is null and nullif(btrim(coalesce(new.bunny_video_id, '')), '') is null then
      raise exception 'This video has no file, so it can''t go live. Reject it with a reason.' using errcode = '22023';
    end if;
    if coalesce(new.duration_seconds, 0) > 60 then
      raise exception 'This video is longer than 60 seconds, so it can''t go live. Reject it with a reason.' using errcode = '22023';
    end if;
  end if;
  return new;
end
$function$;
drop trigger if exists trg_product_videos_live_requirements on public.product_videos;
create trigger trg_product_videos_live_requirements
  before update of status on public.product_videos
  for each row execute function admin.video_live_requirements();

-- The bulk approve leaves those in the queue instead of failing the whole batch on one of them.
create or replace function public.approve_vendor_videos_bulk(p_vendor uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count integer;
begin
  if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'not authorized: product moderation requires the product_moderator role'
      using errcode = '42501';
  end if;
  update public.product_videos
     set status = 'live', rejection_reason = null
   where vendor_id = p_vendor
     and status = 'under_review'
     and (nullif(btrim(coalesce(video_url, '')), '') is not null or nullif(btrim(coalesce(bunny_video_id, '')), '') is not null)
     and coalesce(duration_seconds, 0) <= 60;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- ── AR-M44 Live Activity is computed once per window every 30 seconds, not once per open tab ──────────────────────
-- Every open Live Activity tab polled admin_live_activity() every 30 s, and each call scanned the hour's raw events.
-- The same answer now serves every admin for 30 s: the body moves to admin.live_activity_compute (moved by anchored
-- text, so production's own body is what moves), and the public function reads a one-row-per-window cache.
create table if not exists admin.live_activity_cache (
  window_minutes integer primary key,
  computed_at    timestamptz not null,
  payload        jsonb not null
);
revoke all on admin.live_activity_cache from public, anon, authenticated;

do $$
declare
  d   text := replace(pg_get_functiondef('public.admin_live_activity(integer)'::regprocedure), E'\r\n', E'\n');
  old text := 'CREATE OR REPLACE FUNCTION public.admin_live_activity(';
begin
  if (length(d) - length(replace(d, old, ''))) / length(old) <> 1 then
    raise exception 'AR-M44: admin_live_activity header not found exactly once';
  end if;
  execute replace(d, old, 'CREATE OR REPLACE FUNCTION admin.live_activity_compute(');
end $$;
revoke all on function admin.live_activity_compute(integer) from public, anon, authenticated;

create or replace function public.admin_live_activity(p_minutes integer default 60)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_minutes int := least(greatest(coalesce(p_minutes, 60), 5), 1440);
  v_cached  admin.live_activity_cache;
  v_result  jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;
  select * into v_cached from admin.live_activity_cache c where c.window_minutes = v_minutes;
  if found and v_cached.computed_at > now() - interval '30 seconds' then
    return v_cached.payload;
  end if;
  -- One admin recomputes; the others get the last answer meanwhile (or wait for the first one ever).
  if not pg_try_advisory_xact_lock(hashtext('admin_live_activity:' || v_minutes)) and found then
    return v_cached.payload;
  end if;
  v_result := admin.live_activity_compute(v_minutes);
  insert into admin.live_activity_cache as c (window_minutes, computed_at, payload)
  values (v_minutes, now(), v_result)
  on conflict (window_minutes) do update set computed_at = excluded.computed_at, payload = excluded.payload
   where c.window_minutes = excluded.window_minutes;
  return v_result;
end
$function$;

-- ── AR-M46 A feature switch saves only over what the super admin saw ─────────────────────────────────────────────
-- Two super admins editing one switch's account list: the second save silently replaced the first. The new form takes
-- the switch's updated_at as loaded and refuses (hint 'changed_since_loaded') when someone saved since. The
-- four-argument form stays for the released app.
create or replace function public.admin_feature_flag_set(p_key text, p_enabled boolean, p_allow_profile_ids uuid[],
                                                         p_reason text, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin', false) then
    raise exception 'not authorized: only a super admin changes a feature switch' using errcode = '42501';
  end if;
  perform 1 from public.feature_flags f where f.key = p_key for update;
  if exists (select 1 from public.feature_flags f where f.key = p_key and f.updated_at is distinct from p_expected_updated_at) then
    raise exception 'Someone else changed this switch since you opened it. It has been refreshed: check it and save again.'
      using errcode = 'P0001', hint = 'changed_since_loaded';
  end if;
  perform public.admin_feature_flag_set(p_key, p_enabled, p_allow_profile_ids, p_reason);
end
$function$;
revoke all on function public.admin_feature_flag_set(text, boolean, uuid[], text, timestamptz) from public, anon;
grant execute on function public.admin_feature_flag_set(text, boolean, uuid[], text, timestamptz) to authenticated;
