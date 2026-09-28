-- Admin completion, Phase 3d (Mitra, 2026-09-28): the two steps that waited for the
-- Phase 3 admin panel to be live in production (Cosora-Admin main eb9a8a8, whose bundle
-- was checked for the new calls before this was applied).
--
-- 1. approve_vendor_content_bulk(uuid) is dropped. The Video Closeups screen now calls
--    approve_vendor_videos_bulk(). The old function also put a vendor's pending
--    products and catalogues live from that screen. Nothing else calls it: both repos
--    and every function body were checked.
-- 2. An ADMIN ad decision takes only a listed reason code. ad_apply_decision() refuses
--    a code that isn't in admin.ad_reason_codes when a reviewer made the decision
--    (p_reviewer is set: pause, reject, suspend, request changes). A vendor pausing their
--    own campaign (pause_ad_campaign_by_vendor, no reviewer) keeps free text.
--    Approvals, resumes, archives and the schedule sweep pass no code, as before.

-- ── Pre-check ────────────────────────────────────────────────────────────────
do $pre$
begin
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ad_apply_decision') is distinct from '4ef22d3c84f494990b6e6e9c7e0919bf' then
    raise exception 'pre-check: public.ad_apply_decision() has changed since it was read';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where p.prosrc ~ 'approve_vendor_content_bulk' and p.proname <> 'approve_vendor_content_bulk') then
    raise exception 'pre-check: a function body still calls approve_vendor_content_bulk()';
  end if;
end
$pre$;

-- ── 1 ─────────────────────────────────────────────────────────────────────────
drop function if exists public.approve_vendor_content_bulk(uuid);

-- ── 2 ─────────────────────────────────────────────────────────────────────────
create or replace function public.ad_apply_decision(p_ad_id uuid, p_new_status text, p_decision text, p_reason_code text default null::text, p_note text default null::text, p_reviewer uuid default null::uuid, p_notify_title text default null::text, p_notify_body text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_prev   text;
  v_vendor uuid;
  affected int;
begin
  -- An admin decision's reason is one of the listed codes (admin completion, Phase 3d).
  -- A vendor pausing their own campaign has no reviewer and keeps free text.
  if p_reviewer is not null and p_reason_code is not null
     and not exists (select 1 from admin.ad_reason_codes c where c.code = p_reason_code and c.active) then
    raise exception 'unknown reason code %: pick one from the list', p_reason_code
      using errcode = '22023';
  end if;

  select status, vendor_id into v_prev, v_vendor
    from public.advertisements where id = p_ad_id;
  if v_prev is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;

  perform set_config('cosora.ad_review', 'on', true);

  update public.advertisements
     set status            = p_new_status,
         moderation_reason = case
                               when p_reason_code is null and p_note is null then moderation_reason
                               else nullif(trim(both ' ' from
                                      coalesce(p_reason_code, '') || ' ' || coalesce(p_note, '')), '')
                             end,
         moderated_at      = case when p_reviewer is null then moderated_at else now() end,
         moderated_by      = coalesce(p_reviewer, moderated_by)
   where id = p_ad_id;

  get diagnostics affected = row_count;
  perform set_config('cosora.ad_review', '', true);

  if affected = 0 then
    raise exception 'campaign % could not be moved to %', p_ad_id, p_new_status
      using errcode = 'P0002';
  end if;

  insert into admin.ad_review_log
    (ad_id, reviewer_id, decision, reason_code, note, previous_status, new_status)
  values
    (p_ad_id, p_reviewer, p_decision, p_reason_code, p_note, v_prev, p_new_status);

  if p_notify_title is not null then
    perform public.notify(v_vendor, 'ad_' || p_decision, p_notify_title, p_notify_body);
  end if;
end;
$function$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if to_regprocedure('public.approve_vendor_content_bulk(uuid)') is not null then
    raise exception 'self-check: approve_vendor_content_bulk(uuid) still exists';
  end if;
  if (select prosrc from pg_proc where oid = 'public.ad_apply_decision(uuid, text, text, text, text, uuid, text, text)'::regprocedure) !~ 'unknown reason code' then
    raise exception 'self-check: ad_apply_decision() does not check the reason code';
  end if;
  -- Still not client-callable: only the definer RPCs reach it.
  if has_function_privilege('anon', 'public.ad_apply_decision(uuid, text, text, text, text, uuid, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ad_apply_decision(uuid, text, text, text, text, uuid, text, text)', 'EXECUTE') then
    raise exception 'self-check: ad_apply_decision() is client-callable';
  end if;
end
$check$;
