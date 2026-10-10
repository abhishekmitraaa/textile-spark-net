-- Catalogues get a review screen in Cosora-Admin (Mitra, 2026-10-10: "Catalogues have no review screen in the admin
-- app, fix this").
--
-- A seller's catalogue is uploaded 'under_review', and nothing in Cosora-Admin showed it: approve_vendor_content()
-- was its only way out of review, and no screen called it. Cosora-Admin › Catalogues now moderates catalogues the way
-- Products and Videos moderate theirs: one status update, which the database refuses for anyone who may not make it.
-- What the database adds for that:
--
-- 1. catalogues.rejection_reason: a rejected catalogue says why, as a listing and a video do, and the seller sees it on
--    their catalogue page. reject_vendor_content() is not changed (it stays status-only for catalogues); the screen
--    doesn't use it.
-- 2. catalogues_moderation_guard() (from 20261010060959_server_owned_columns) gets the rules
--    enforce_product_videos_moderation() already has for videos:
--      - a rejection needs a reason the seller can act on; approving clears it;
--      - only a moderator (super_admin, product_moderator) writes the reason; a seller's new catalogue carries none;
--      - a moderator who isn't the owner changes the status and the reason, nothing else.
--    The rest is as it was: a seller sets 'draft' or 'under_review', a new catalogue is dated now, the service role
--    and definer functions are left alone.
--
-- Harness: scripts/security/catalogue_review.sql. Browser: tests/local/catalogue-review.spec.ts.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if md5(replace((select prosrc from pg_proc where oid = 'public.catalogues_moderation_guard()'::regprocedure), chr(13), ''))
     <> 'b2e5a4a6189afa9f9b70aec94b068b22' then
    raise exception 'catalogues_moderation_guard changed since it was read; re-read it before patching';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'catalogues' and column_name = 'rejection_reason') then
    raise exception 'catalogues.rejection_reason already exists; read it before applying this again';
  end if;
end
$guard$;

-- ── 1. The reason ──────────────────────────────────────────────────────────────────
alter table public.catalogues add column rejection_reason text;

-- ── 2. The rules ───────────────────────────────────────────────────────────────────
create or replace function public.catalogues_moderation_guard()
returns trigger
language plpgsql set search_path = 'public' as $function$
declare
  v_moderator boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  v_moderator := coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'), false);

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review') and not v_moderator then
      new.status := 'under_review';
    end if;
    if not v_moderator then
      new.rejection_reason := null;
    end if;
    new.created_at := now();
    return new;
  end if;

  new.created_at := old.created_at;

  -- A moderator who is not the owner changes the status and the reason only.
  if auth.uid() is distinct from old.vendor_id and public.is_admin() then
    if (to_jsonb(new) - array['status', 'rejection_reason']) is distinct from (to_jsonb(old) - array['status', 'rejection_reason']) then
      raise exception 'A moderator changes a catalogue''s status and rejection reason only; the rest of the catalogue is the vendor''s'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set catalogue status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not v_moderator then
      raise exception 'Catalogue moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;

  -- A rejection carries a reason the seller can act on; a catalogue put live has none.
  if new.status = 'rejected' and old.status is distinct from 'rejected'
     and coalesce(btrim(new.rejection_reason), '') = '' then
    raise exception 'A rejection needs a reason the vendor can act on'
      using errcode = '22023';
  end if;
  if new.status = 'live' and new.status is distinct from old.status then
    new.rejection_reason := null;
  end if;

  if new.rejection_reason is distinct from old.rejection_reason and not v_moderator then
    raise exception 'Changing a catalogue rejection reason requires the super_admin or product_moderator role'
      using errcode = '42501';
  end if;
  return new;
end
$function$;
