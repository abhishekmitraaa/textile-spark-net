-- Admin completion, Phase 3a (Mitra, 2026-09-27): review actions that are whole.
--
-- 1. block_account_from_review(): blocking a participant from the chat review queue
--    is ONE transaction. The panel used to call set_account_status() and then
--    resolve_conversation_review() as two requests. A failure between them left an
--    account suspended with its review still pending (reproduced 2026-09-26). This
--    function takes the review row lock, checks the profile is really in that
--    conversation and that the reason is an active block reason, then calls the
--    same two functions. Both land or neither does. set_account_status() stays the
--    suspension ledger's only writer.
-- 2. approve_vendor_videos_bulk(): "Approve all for vendor" on the Video Closeups
--    screen approves that vendor's pending VIDEOS and returns how many.
--    approve_vendor_content_bulk() also put their pending products and catalogues
--    live, from a screen that shows neither. The old function is dropped by a
--    follow-up migration, once the panel that calls it is replaced in production.
-- 3. One vocabulary of ad-moderation reasons, admin.ad_reason_codes (the 8 codes
--    the review queue already uses), read by admin_ad_reason_codes().
--    pause_ad_campaign_by_admin() gains an optional note, like reject and suspend,
--    so a code no longer has to carry free text. A follow-up migration refuses
--    unknown codes once the panel sends only listed ones.
-- 4. The vendor-facing notice of a rejection, suspension or pause says the reason's
--    label ("Image or copy quality"), not its code ("poor_creative"), when there's
--    no note.

-- ── Pre-check: patch exactly the bodies read on 2026-09-27 ────────────────────
do $pre$
declare
  v_expected jsonb := '{
    "reject_ad_campaign":         "e447b877ebb8e722df0159d0229aa612",
    "suspend_ad_campaign":        "e12fe37d15766a247368cd58b46cb38a",
    "pause_ad_campaign_by_admin": "faae758178168f65723256b3b488ad6c"
  }';
  k text;
  v_md5 text;
begin
  for k in select jsonb_object_keys(v_expected) loop
    select md5(p.prosrc) into v_md5
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = k;
    if v_md5 is distinct from v_expected ->> k then
      raise exception 'pre-check: public.% has changed since it was read (md5 %, expected %)', k, v_md5, v_expected ->> k;
    end if;
  end loop;
end
$pre$;

-- ── 1: block from the review queue, atomically ───────────────────────────────
create or replace function public.block_account_from_review(
  p_review_id  uuid,
  p_profile_id uuid,
  p_side       text,
  p_reason_id  uuid,
  p_resume     boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conversation uuid;
  v_status       text;
  v_user_a       uuid;
  v_user_b       uuid;
begin
  if not (public.is_admin() and public.admin_role() in ('support', 'super_admin')) then
    raise exception 'not authorized: blocking from a chat review requires the support or super_admin role'
      using errcode = '42501';
  end if;
  if p_side is null or p_side not in ('buyer', 'vendor') then
    raise exception 'invalid side: % (expected buyer or vendor)', p_side using errcode = '22023';
  end if;
  if p_reason_id is null
     or not exists (select 1 from admin.chat_block_reasons r where r.id = p_reason_id and r.active) then
    raise exception 'a block needs an active reason from the block-reasons list' using errcode = '22023';
  end if;

  -- Lock the review: a second reviewer blocking at the same moment waits here,
  -- then finds it no longer pending.
  select r.conversation_id, r.status into v_conversation, v_status
    from admin.conversation_reviews r
   where r.id = p_review_id
     for update;
  if v_conversation is null then
    raise exception 'chat review % does not exist', p_review_id using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'chat review % is not pending — it was already %', p_review_id, v_status using errcode = 'P0002';
  end if;

  select c.user_a, c.user_b into v_user_a, v_user_b
    from public.conversations c
   where c.id = v_conversation;
  if p_profile_id is null or (p_profile_id is distinct from v_user_a and p_profile_id is distinct from v_user_b) then
    raise exception 'that account is not a participant in this conversation' using errcode = '22023';
  end if;

  -- One transaction: the suspension and the verdict land together, or neither does.
  perform public.set_account_status(p_profile_id, 'suspended', p_reason_id, 'chat_review', p_review_id);
  perform public.resolve_conversation_review(
    p_review_id,
    case p_side when 'buyer' then 'buyer_blocked' else 'vendor_blocked' end,
    p_reason_id,
    coalesce(p_resume, false));
end;
$function$;

revoke all on function public.block_account_from_review(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.block_account_from_review(uuid, uuid, text, uuid, boolean) to authenticated;

-- ── 2: approve a vendor's pending videos, and only videos ───────────────────
create or replace function public.approve_vendor_videos_bulk(p_vendor uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
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
     and status = 'under_review';
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.approve_vendor_videos_bulk(uuid) from public, anon, authenticated;
grant execute on function public.approve_vendor_videos_bulk(uuid) to authenticated;

-- ── 3: the ad-moderation reason vocabulary ───────────────────────────────────
create table if not exists admin.ad_reason_codes (
  code   text primary key check (code ~ '^[a-z][a-z_]{2,40}$'),
  label  text not null check (length(btrim(label)) between 3 and 80),
  active boolean not null default true,
  sort   smallint not null default 100
);
alter table admin.ad_reason_codes enable row level security;

insert into admin.ad_reason_codes (code, label, sort) values
  ('misleading_claims',   'Misleading or unverifiable claims',  10),
  ('prohibited_content',  'Prohibited content',                 20),
  ('poor_creative',       'Image or copy quality',              30),
  ('wrong_category',      'Targeting does not match the product', 40),
  ('product_unavailable', 'Promoted product is not live',       50),
  ('trademark',           'Trademark or brand misuse',          60),
  ('fraud_review',        'Suspected invalid traffic / fraud',  70),
  ('policy_other',        'Other policy breach',                80)
on conflict (code) do nothing;

create or replace function public.admin_ad_reason_codes()
returns table(code text, label text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;
  return query
    select c.code, c.label from admin.ad_reason_codes c where c.active order by c.sort, c.code;
end
$function$;

revoke all on function public.admin_ad_reason_codes() from public, anon, authenticated;
grant execute on function public.admin_ad_reason_codes() to authenticated;

-- pause_ad_campaign_by_admin gains a note. Its argument list changes, so drop the old
-- signature first (a CREATE OR REPLACE would add an overload) and restore the grants.
drop function public.pause_ad_campaign_by_admin(uuid, text);
create function public.pause_ad_campaign_by_admin(p_ad_id uuid, p_reason_code text, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: pausing a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required when an admin pauses a campaign' using errcode = '22023';
  end if;
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur not in ('active', 'scheduled', 'paused_by_vendor', 'paused') then
    raise exception 'campaign % is %, it is not running', p_ad_id, v_cur using errcode = 'P0001';
  end if;
  perform public.ad_apply_decision(
    p_ad_id, 'paused_by_admin', 'paused', p_reason_code, nullif(btrim(p_note), ''), auth.uid(),
    'Your campaign was paused by Cosora',
    coalesce(nullif(btrim(p_note), ''),
             (select c.label from admin.ad_reason_codes c where c.code = p_reason_code),
             p_reason_code));
end $function$;

revoke all on function public.pause_ad_campaign_by_admin(uuid, text, text) from public, anon;
grant execute on function public.pause_ad_campaign_by_admin(uuid, text, text) to authenticated, service_role;

-- ── 4: the vendor reads a label, not a code ──────────────────────────────────
create or replace function public.reject_ad_campaign(p_ad_id uuid, p_reason_code text, p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: rejecting a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required to reject a campaign' using errcode = '22023';
  end if;

  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur in ('rejected', 'archived') then
    raise exception 'campaign % is already %', p_ad_id, v_cur using errcode = 'P0001';
  end if;

  perform public.ad_apply_decision(
    p_ad_id, 'rejected', 'rejected', p_reason_code, p_note, auth.uid(),
    'Your campaign was not approved',
    coalesce(nullif(btrim(p_note), ''),
             (select c.label from admin.ad_reason_codes c where c.code = p_reason_code),
             p_reason_code));
end $function$;

create or replace function public.suspend_ad_campaign(p_ad_id uuid, p_reason_code text, p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cur text;
begin
  if not public.ad_moderator() then
    raise exception 'not authorized: suspending a campaign requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'a reason_code is required to suspend a campaign' using errcode = '22023';
  end if;
  select status into v_cur from public.advertisements where id = p_ad_id;
  if v_cur is null then
    raise exception 'no advertisements row with id %', p_ad_id using errcode = 'P0002';
  end if;
  if v_cur in ('suspended', 'archived') then
    raise exception 'campaign % is already %', p_ad_id, v_cur using errcode = 'P0001';
  end if;
  perform public.ad_apply_decision(
    p_ad_id, 'suspended', 'suspended', p_reason_code, p_note, auth.uid(),
    'Your campaign was suspended pending review',
    coalesce(nullif(btrim(p_note), ''),
             (select c.label from admin.ad_reason_codes c where c.code = p_reason_code),
             p_reason_code));
end $function$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.block_account_from_review(uuid, uuid, text, uuid, boolean)',
    'public.approve_vendor_videos_bulk(uuid)',
    'public.admin_ad_reason_codes()',
    'public.pause_ad_campaign_by_admin(uuid, text, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'self-check: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: authenticated cannot execute %', f;
    end if;
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;
  if to_regprocedure('public.pause_ad_campaign_by_admin(uuid, text)') is not null then
    raise exception 'self-check: the 2-argument pause_ad_campaign_by_admin still exists (overload)';
  end if;
  if (select count(*) from admin.ad_reason_codes where active) <> 8 then
    raise exception 'self-check: expected 8 active ad reason codes';
  end if;
  if has_table_privilege('authenticated', 'admin.ad_reason_codes', 'SELECT')
     or has_table_privilege('anon', 'admin.ad_reason_codes', 'SELECT') then
    raise exception 'self-check: a client role can read admin.ad_reason_codes directly';
  end if;
  if (select prosrc from pg_proc where oid = 'public.reject_ad_campaign(uuid, text, text)'::regprocedure) !~ 'ad_reason_codes'
     or (select prosrc from pg_proc where oid = 'public.suspend_ad_campaign(uuid, text, text)'::regprocedure) !~ 'ad_reason_codes' then
    raise exception 'self-check: reject/suspend do not read reason labels';
  end if;
end
$check$;
