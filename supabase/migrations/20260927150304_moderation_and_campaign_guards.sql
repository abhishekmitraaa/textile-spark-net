-- Admin completion, Phase 1b (Mitra, 2026-09-27): moderation and campaign guards.
--
-- 1. A moderator who is not a listing's owner changes its moderation columns
--    (status, rejection_reason) and nothing else. Until now a product_moderator
--    could rewrite a live listing's name or price through the same UPDATE that
--    approves it. The listing's content is the vendor's. Generated columns are
--    skipped, because a BEFORE trigger does not see their new values.
-- 2. A move to 'rejected' needs a non-blank reason, for products and videos, on
--    the direct UPDATE the panel uses and on reject_vendor_content(). The vendor
--    sees the reason ("A rejection reason must reach the vendor", claude.md), so a
--    blank one tells them nothing. Until now only the panel's textarea required it.
-- 3. Plan and badge columns on vendor_profiles follow the roles that own them:
--    plan_id / plan_expires_at -> super_admin, finance_admin (the subscription
--    system and finance), ad_verified_until -> super_admin (normally granted by an
--    approval, via grant_ad_verification()). vendor_ops keeps is_verified. Until now
--    vendor_ops could extend a plan, which also grants the trust seal and the
--    search boost.
-- 4. A reviewed campaign cannot be deleted through the API by anyone. Admins lost
--    their direct write path in 1a; this removes guard_ad_deletion's admin bypass
--    too, so the review history (admin.ad_review_log) survives.
-- 5. Ad delivery counters (impressions, clicks) move only through ad_impression()
--    and ad_click(). A vendor could set their own campaign's counters until now.
--
-- SECURITY DEFINER paths are unaffected: every trigger here returns early unless
-- current_user is 'authenticated', and definer functions run as their owner.

-- ── Pre-check: patch exactly the bodies read on 2026-09-27 ────────────────────
do $pre$
declare
  v_expected jsonb := '{
    "enforce_products_moderation":         "c94571fb267ae03ad7d48d553587f84a",
    "enforce_product_videos_moderation":   "70cb175622355c8f5663f470951ed235",
    "reject_vendor_content":               "c4a41492e6520843e4419b2579567de4",
    "enforce_vendor_profile_admin_fields": "87d096c72461ed70f2cdbe0d5d75a4f3",
    "guard_ad_deletion":                   "bcb7a366f5cc19e5c8f63ac161ed53c2",
    "enforce_ads_moderation":              "19e975a7f1a2246eaf67931babc813a5"
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

-- ── 1 + 2: products ──────────────────────────────────────────────────────────
create or replace function public.enforce_products_moderation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_generated text[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review')
       and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.status := 'under_review';
    end if;
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.rejection_reason := null;
    end if;
    return new;
  end if;

  -- A moderator who is not the owner changes the moderation columns only.
  if auth.uid() is distinct from old.vendor_id and public.is_admin() then
    select coalesce(array_agg(a.attname::text), '{}') into v_generated
      from pg_attribute a
     where a.attrelid = tg_relid and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';
    if (to_jsonb(new) - v_generated - array['status', 'rejection_reason'])
       is distinct from (to_jsonb(old) - v_generated - array['status', 'rejection_reason']) then
      raise exception 'A moderator changes a listing''s status and rejection reason only; the rest of the listing is the vendor''s'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set product status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      raise exception 'Product moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;

  -- A rejection carries a reason the vendor can act on.
  if new.status = 'rejected' and old.status is distinct from 'rejected'
     and coalesce(btrim(new.rejection_reason), '') = '' then
    raise exception 'A rejection needs a reason the vendor can act on'
      using errcode = '22023';
  end if;

  if new.rejection_reason is distinct from old.rejection_reason
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'Changing a product rejection reason requires the super_admin or product_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ── 1 + 2: product videos ────────────────────────────────────────────────────
create or replace function public.enforce_product_videos_moderation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_generated text[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review')
       and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.status := 'under_review';
    end if;
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.rejection_reason := null;
    end if;
    return new;
  end if;

  -- A moderator who is not the owner changes the moderation columns only.
  if auth.uid() is distinct from old.vendor_id and public.is_admin() then
    select coalesce(array_agg(a.attname::text), '{}') into v_generated
      from pg_attribute a
     where a.attrelid = tg_relid and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';
    if (to_jsonb(new) - v_generated - array['status', 'rejection_reason'])
       is distinct from (to_jsonb(old) - v_generated - array['status', 'rejection_reason']) then
      raise exception 'A moderator changes a video''s status and rejection reason only; the rest of the video is the vendor''s'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set product video status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      raise exception 'Product video moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;

  -- A rejection carries a reason the vendor can act on.
  if new.status = 'rejected' and old.status is distinct from 'rejected'
     and coalesce(btrim(new.rejection_reason), '') = '' then
    raise exception 'A rejection needs a reason the vendor can act on'
      using errcode = '22023';
  end if;

  if new.rejection_reason is distinct from old.rejection_reason
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'Changing a product video rejection reason requires the super_admin or product_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ── 2: reject_vendor_content() needs a reason for products and videos ────────
create or replace function public.reject_vendor_content(target_table text, target_id uuid, reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  affected int;
begin
  if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'not authorized: product moderation requires the product_moderator role';
  end if;

  -- Catalogues have no reason column; a listing or video tells the vendor why.
  if target_table in ('products', 'product_videos') and coalesce(btrim(reason), '') = '' then
    raise exception 'A rejection needs a reason the vendor can act on'
      using errcode = '22023';
  end if;

  if target_table = 'products' then
    update public.products
       set status = 'rejected', rejection_reason = reason
     where id = target_id;
  elsif target_table = 'product_videos' then
    update public.product_videos
       set status = 'rejected', rejection_reason = reason
     where id = target_id;
  elsif target_table = 'catalogues' then
    update public.catalogues
       set status = 'rejected'
     where id = target_id;
  else
    raise exception 'unknown moderation target: %', target_table
      using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'no % row with id %', target_table, target_id
      using errcode = 'P0002';
  end if;
end;
$function$;

-- ── 3: vendor_profiles plan and badge columns follow their owning roles ──────
create or replace function public.enforce_vendor_profile_admin_fields()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- Review aggregates, for EVERY role: nothing above this line returns early.
  if tg_op = 'INSERT' then
    new.rating_avg    := coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.vendor_id = new.id), 0);
    new.reviews_count := (select count(*) from public.reviews r where r.vendor_id = new.id);
  elsif (new.rating_avg is distinct from old.rating_avg
         or new.reviews_count is distinct from old.reviews_count)
        and coalesce(current_setting('cosora.review_aggregate_sync', true), '') <> 'on' then
    raise exception 'rating_avg and reviews_count are computed from reviews and cannot be set directly'
      using errcode = '42501';
  end if;

  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Each admin field belongs to one set of roles (admin completion, Phase 1b):
  --   is_verified                -> super_admin, vendor_ops
  --   plan_id, plan_expires_at   -> super_admin, finance_admin
  --   ad_verified_until          -> super_admin
  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
      new.is_verified := false;
    end if;
    if not (public.is_admin() and public.admin_role() = 'super_admin') then
      new.ad_verified_until := null;
    end if;
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin')) then
      new.plan_id         := null;
      new.plan_expires_at := null;
    end if;
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Changing vendor verification requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;

  if new.ad_verified_until is distinct from old.ad_verified_until
     and not (public.is_admin() and public.admin_role() = 'super_admin') then
    raise exception 'The verification badge is granted when an admin approves a campaign; it cannot be set directly'
      using errcode = '42501';
  end if;

  if (new.plan_id is distinct from old.plan_id
      or new.plan_expires_at is distinct from old.plan_expires_at)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin')) then
    raise exception 'Subscription tier and expiry are set by the subscription system and cannot be edited directly'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ── 4: no API deletion of a reviewed campaign, admins included ───────────────
create or replace function public.guard_ad_deletion()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if current_setting('role', true) is distinct from 'authenticated' then return old; end if;
  -- No admin bypass (admin completion, Phase 1b): a reviewed campaign keeps its
  -- review history for everyone. An admin suspends or rejects it instead.
  if exists (select 1 from admin.ad_review_log where ad_id = old.id) then
    raise exception
      'This campaign has already been reviewed, so its history cannot be deleted. Pause it instead, or ask Cosora to archive it.'
      using errcode = '42501';
  end if;
  return old;
end $function$;

-- ── 5: delivery counters move only through the ad server ─────────────────────
create or replace function public.enforce_ads_moderation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
      new.moderation_reason := null;
      new.moderated_at      := null;
      new.moderated_by      := null;
    end if;
    -- Delivery counters start at zero; only ad_impression() / ad_click() move them.
    new.impressions := 0;
    new.clicks      := 0;
    return new;
  end if;

  if new.impressions is distinct from old.impressions or new.clicks is distinct from old.clicks then
    raise exception 'Impressions and clicks are counted by the ad server and cannot be set directly'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'pending_review', 'paused_by_vendor', 'archived') then
        raise exception 'Vendors cannot set campaign status to %; admin review is required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
      raise exception 'Ad moderation requires the super_admin or ads_moderator role'
        using errcode = '42501';
    end if;
  end if;

  if (new.moderation_reason is distinct from old.moderation_reason
      or new.moderated_at is distinct from old.moderated_at
      or new.moderated_by is distinct from old.moderated_by)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
    raise exception 'Recording an ad moderation reason requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  r record;
begin
  for r in
    select p.proname, p.prosrc, p.prosecdef, p.proconfig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('enforce_products_moderation', 'enforce_product_videos_moderation', 'reject_vendor_content',
                         'enforce_vendor_profile_admin_fields', 'guard_ad_deletion', 'enforce_ads_moderation')
  loop
    -- Security properties unchanged: the triggers stay INVOKER, the two definers stay DEFINER.
    if r.prosecdef is distinct from (r.proname in ('reject_vendor_content', 'guard_ad_deletion')) then
      raise exception 'self-check: % security mode changed', r.proname;
    end if;
    if r.proconfig is null or not exists (select 1 from unnest(r.proconfig) c where c like 'search_path=%') then
      raise exception 'self-check: % lost its pinned search_path', r.proname;
    end if;
  end loop;

  if (select prosrc from pg_proc where oid = 'public.enforce_products_moderation()'::regprocedure) !~ 'the rest of the listing is the vendor'
     or (select prosrc from pg_proc where oid = 'public.enforce_product_videos_moderation()'::regprocedure) !~ 'the rest of the video is the vendor'
     or (select prosrc from pg_proc where oid = 'public.enforce_products_moderation()'::regprocedure) !~ 'A rejection needs a reason'
     or (select prosrc from pg_proc where oid = 'public.reject_vendor_content(text, uuid, text)'::regprocedure) !~ 'A rejection needs a reason'
     or (select prosrc from pg_proc where oid = 'public.enforce_vendor_profile_admin_fields()'::regprocedure) !~ 'super_admin'', ''finance_admin'
     or (select prosrc from pg_proc where oid = 'public.guard_ad_deletion()'::regprocedure) ~ 'is_admin'
     or (select prosrc from pg_proc where oid = 'public.enforce_ads_moderation()'::regprocedure) !~ 'new.impressions := 0' then
    raise exception 'self-check: a Phase 1b guard is missing';
  end if;

  -- The triggers still point at these functions.
  if not exists (select 1 from pg_trigger where tgname = 'trg_products_moderation' and tgfoid = 'public.enforce_products_moderation()'::regprocedure)
     or not exists (select 1 from pg_trigger where tgname = 'trg_product_videos_moderation' and tgfoid = 'public.enforce_product_videos_moderation()'::regprocedure)
     or not exists (select 1 from pg_trigger where tgname = 'trg_vendor_profiles_admin_fields' and tgfoid = 'public.enforce_vendor_profile_admin_fields()'::regprocedure)
     or not exists (select 1 from pg_trigger where tgname = 'trg_guard_ad_deletion' and tgfoid = 'public.guard_ad_deletion()'::regprocedure)
     or not exists (select 1 from pg_trigger where tgname = 'trg_ads_moderation' and tgfoid = 'public.enforce_ads_moderation()'::regprocedure) then
    raise exception 'self-check: a trigger no longer points at its guard';
  end if;
end
$check$;
