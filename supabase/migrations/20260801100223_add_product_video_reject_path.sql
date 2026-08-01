-- Give moderation a reject path. Until now approve_vendor_content() was the
-- only moderation verb in the system: a video that should never go live could
-- only be left pending forever or deleted outright, with no reason recorded
-- and nothing to show the vendor. product_status has had a 'rejected' value
-- all along, MyVideoRow types it and UploadVideo renders it — nothing could
-- ever set it.
--
-- Three parts:
--   1. product_videos.rejection_reason, matching products' column exactly
--      (text, nullable, no default).
--   2. reject_vendor_content(), same authz gate as approve_vendor_content()
--      but scoped to ONE row rather than everything a vendor owns.
--   3. rejection_reason clauses added to enforce_product_videos_moderation().
--      Phase 1 deliberately left these out because the column did not exist
--      yet; adding the column without them would hand vendors write access to
--      the moderator's stated reason on their own row (RLS pvideos_write
--      already lets them PATCH it), which is the same class of hole Phase 1
--      just closed. These clauses are copied from enforce_products_moderation().

alter table public.product_videos
  add column if not exists rejection_reason text null;

comment on column public.product_videos.rejection_reason is
  'Moderator note explaining a rejected reel. Writable only via reject_vendor_content() or by a super_admin/product_moderator; enforced by trg_product_videos_moderation.';

-- ── 1. reject, per item ────────────────────────────────────────────────────
--
-- Deliberately NOT modelled on approve_vendor_content's vendor-wide blast
-- radius: rejecting is a per-item judgement ("this clip is out of focus"),
-- never a statement about everything a vendor has pending.
--
-- target_table is validated against a fixed list with one static UPDATE per
-- branch. No dynamic SQL: a text table name concatenated into EXECUTE inside a
-- SECURITY DEFINER function is an injection vector, and there are only three
-- moderated tables.
--
-- Rejection is allowed from ANY current status, not just under_review, so a
-- moderator can also take down something already live. Re-rejecting an
-- already-rejected row is allowed too, so a reason can be amended.
create or replace function public.reject_vendor_content(
  target_table text,
  target_id uuid,
  reason text default null
)
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

  if target_table = 'products' then
    update public.products
       set status = 'rejected', rejection_reason = reason
     where id = target_id;
  elsif target_table = 'product_videos' then
    update public.product_videos
       set status = 'rejected', rejection_reason = reason
     where id = target_id;
  elsif target_table = 'catalogues' then
    -- catalogues has no rejection_reason column, so the note is dropped here
    -- rather than silently pretending it was stored.
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

-- ── 2. protect rejection_reason on product_videos ──────────────────────────
create or replace function public.enforce_product_videos_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review')
       and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.status := 'under_review';
    end if;
    -- A vendor cannot ship a pre-baked rejection note with a new upload.
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.rejection_reason := null;
    end if;
    return new;
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

  -- Without this a vendor could edit or erase the moderator's reason on their
  -- own row: pvideos_write only constrains vendor_id, not which columns move.
  if new.rejection_reason is distinct from old.rejection_reason
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'Changing a product video rejection reason requires the super_admin or product_moderator role'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
