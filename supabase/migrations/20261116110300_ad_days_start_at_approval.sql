-- Paid ad days start when Cosora approves the campaign, and are kept while it is paused
-- (Seller Home audit SH-088; Mitra, 2026-11-16: "Give paused days back").
--
-- Before: a campaign's dates were set when it was paid for (starts now, ends now + days) and never moved. Review ate
-- the days: a 3-day campaign paid on Friday and reviewed on Monday had "already ended", approve_ad_campaign() refused
-- it, nothing expired it, and the seller's card said "waiting for review" for ever with the money kept. A paused
-- campaign kept using up its days too, under "Pay only for what you use".
--
-- Now:
--   * Approval moves the window to start now, with the length that was paid for. A campaign booked to start later
--     keeps its dates. Trusted Seal and Verified Certificate badges run to the new end.
--   * advertisements.paused_at records when a pause began (the first one, when Cosora pauses on top of the seller).
--   * Resuming adds the paused time back to the end date: the time since the later of the pause and the start date, so
--     a pause that ended before the campaign started adds nothing. A seller's pause and Cosora's are treated alike.
--   * Trusted Seal and Verified Certificate campaigns get nothing back: the badge stays on the profile while the
--     campaign is paused, so their days keep running.
--   * The sweep no longer ends a paused campaign that holds its days. One paused after its end date holds none.
--
-- The dates stay the server's: a seller can't write starts_at, ends_at or paused_at on a submitted campaign
-- (enforce_ads_moderation compares every column outside its short lists), and a browser's new draft gets no paused_at.

-- 1. When the pause began.
alter table public.advertisements add column if not exists paused_at timestamptz;
comment on column public.advertisements.paused_at is
  'When the current pause began; null unless paused. Written by ad_apply_decision() only. resume_ad_campaign() adds the paused time back to ends_at (not for seal placements).';

create or replace function public.ads_paused_at_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The server's value. A browser's new draft can't carry one.
  if current_user = 'authenticated' then
    new.paused_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists trg_ads_paused_at on public.advertisements;
create trigger trg_ads_paused_at
  before insert on public.advertisements
  for each row execute function public.ads_paused_at_guard();

-- 2. Every status move records or clears the pause.
create or replace function public.ad_apply_decision(p_ad_id uuid, p_new_status text, p_decision text, p_reason_code text default null::text, p_note text default null::text, p_reviewer uuid default null::uuid, p_notify_title text default null::text, p_notify_body text default null::text)
returns void
language plpgsql
security definer
set search_path = public
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
         -- A pause starts once: Cosora pausing a campaign the seller already paused keeps the first moment.
         paused_at         = case when p_new_status in ('paused_by_vendor', 'paused_by_admin', 'paused')
                                  then coalesce(paused_at, now()) end,
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

-- 3. Approval starts the clock.
create or replace function public.approve_ad_campaign(p_ad_id uuid, p_note text default null::text)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_cur text; v_target text; v_ad public.advertisements; s text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: approving a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  select * into v_ad from public.advertisements where id = p_ad_id for update;
  if v_ad.id is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  v_cur := v_ad.status;

  if v_cur <> 'pending_review' then
    raise exception 'campaign % is %, only a pending_review campaign can be approved', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  -- The days that were paid for start now, not when the order was paid (SH-088): the time in review, and any time
  -- spent on "changes needed", is not the seller's to lose. A campaign booked to start later keeps its dates.
  if v_ad.starts_at is not null and v_ad.ends_at is not null and v_ad.starts_at <= now() then
    update public.advertisements
       set ends_at = now() + (ends_at - starts_at),
           starts_at = now()
     where id = p_ad_id;
    select * into v_ad from public.advertisements where id = p_ad_id;
  end if;

  v_target := public.ad_target_live_status(p_ad_id);
  if v_target = 'expired' then
    raise exception 'campaign % has already ended; approving it would publish nothing', p_ad_id
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, v_target, 'approved', null, p_note, auth.uid(),
    case when v_target = 'scheduled'
         then 'Your campaign was approved and is scheduled'
         else 'Your campaign was approved and is now live' end,
    p_note);

  -- The badge runs to the campaign's end as it now stands.
  foreach s in array public.ad_seal_sources(v_ad.placement) loop
    perform public.grant_ad_verification(
      v_ad.vendor_id, s, coalesce(v_ad.ends_at, now() + interval '30 days'));
  end loop;

  return v_target;
end $function$;

-- 4. Resuming gives the paused time back.
create or replace function public.resume_ad_campaign(p_ad_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare v_cur text; v_target text; v_is_admin boolean := public.ad_moderator();
begin
  select status into v_cur from public.advertisements where id = p_ad_id for update;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;

  if v_cur = 'paused_by_admin' then
    if not v_is_admin then
      raise exception 'not authorized: this campaign was paused by Cosora and only an admin can resume it'
        using errcode = '42501';
    end if;
  elsif v_cur in ('paused_by_vendor', 'paused') then
    if not (public.ad_owner(p_ad_id) or v_is_admin) then
      raise exception 'not authorized: only the campaign owner or an admin can resume it' using errcode = '42501';
    end if;
  else
    raise exception 'campaign % is %, only a paused campaign can be resumed', p_ad_id, v_cur
      using errcode = 'P0001';
  end if;

  -- The paused time goes back on the end date (SH-088): the time since the later of the pause and the start date, so
  -- a pause that was over before the campaign started adds nothing. Seal placements keep running while paused (the
  -- badge stays on the profile), so they get nothing back. A refusal below undoes this with the rest of the call.
  update public.advertisements a
     set ends_at = a.ends_at + greatest(interval '0', now() - greatest(a.paused_at, a.starts_at))
   where a.id = p_ad_id
     and a.paused_at is not null
     and a.ends_at is not null
     and cardinality(public.ad_seal_sources(a.placement)) = 0;

  v_target := public.ad_target_live_status(p_ad_id);
  if v_target = 'expired' then
    raise exception 'campaign % ended while it was paused; it cannot be resumed', p_ad_id
      using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, v_target, 'resumed', null, null,
    case when v_is_admin then auth.uid() else null end, null, null);
  return v_target;
end $function$;

-- 5. The sweep leaves a paused campaign that holds its days.
create or replace function public.sweep_ad_schedules()
returns table(promoted integer, expired integer)
language plpgsql
security definer
set search_path = public
as $function$
declare r record; v_promoted int := 0; v_expired int := 0;
begin
  for r in
    select id from public.advertisements
     where status = 'scheduled'
       and starts_at is not null and starts_at <= now()
       and (ends_at is null or ends_at > now())
     order by starts_at
  loop
    perform public.ad_apply_decision(
      r.id, 'active', 'promoted', null, null, null,
      'Your campaign has started', null);
    v_promoted := v_promoted + 1;
  end loop;

  for r in
    select id from public.advertisements a
     where a.ends_at is not null and a.ends_at <= now()
       and (a.status in ('active', 'scheduled')
            -- Paused: only when it holds no days. It holds them when the pause began before the end date and the
            -- campaign isn't a seal (resume_ad_campaign gives exactly that time back).
            or (a.status in ('paused_by_vendor', 'paused_by_admin', 'paused')
                and (a.paused_at is null
                     or a.paused_at >= a.ends_at
                     or cardinality(public.ad_seal_sources(a.placement)) > 0)))
     order by a.ends_at
  loop
    perform public.ad_apply_decision(
      r.id, 'expired', 'expired', null, null, null,
      'Your campaign has finished its run', null);
    v_expired := v_expired + 1;
  end loop;

  return query select v_promoted, v_expired;
end $function$;

-- 6. Campaigns paused today: their pause began when the review log says, so they get that time back too.
update public.advertisements a
   set paused_at = coalesce(
         (select max(l.created_at) from admin.ad_review_log l
           where l.ad_id = a.id and l.new_status in ('paused_by_vendor', 'paused_by_admin', 'paused')
             and l.previous_status not in ('paused_by_vendor', 'paused_by_admin', 'paused')),
         now())
 where a.status in ('paused_by_vendor', 'paused_by_admin', 'paused')
   and a.paused_at is null;

-- 7. Self-check.
do $$
declare
  f text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'advertisements' and column_name = 'paused_at') then
    raise exception 'advertisements.paused_at is missing';
  end if;
  if exists (select 1 from public.advertisements a
              where a.status in ('paused_by_vendor', 'paused_by_admin', 'paused') and a.paused_at is null) then
    raise exception 'a paused campaign has no paused_at';
  end if;
  foreach f in array array['ad_apply_decision', 'approve_ad_campaign', 'resume_ad_campaign', 'sweep_ad_schedules'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = f and p.prosecdef) then
      raise exception '% must stay SECURITY DEFINER', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.ad_apply_decision(uuid, text, text, text, text, uuid, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.sweep_ad_schedules()', 'execute') then
    raise exception 'ad_apply_decision and sweep_ad_schedules must not be callable from a browser';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.advertisements'::regclass and tgname = 'trg_ads_paused_at') then
    raise exception 'trg_ads_paused_at is missing';
  end if;
end $$;
