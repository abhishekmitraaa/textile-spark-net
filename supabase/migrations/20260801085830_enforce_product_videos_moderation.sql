-- Close the moderation bypass on product_videos.
--
-- Audited live: a vendor hitting PostgREST directly could publish straight to
-- the buyer feed three different ways —
--   * INSERT with status:'live'          -> HTTP 201, stored live
--   * INSERT omitting status entirely    -> HTTP 201, stored live
--   * PATCH own under_review -> 'live'   -> HTTP 200, stored live
--
-- Two independent causes, so this migration fixes both:
--
--  1. The column default was 'live'. product_videos was the ONLY moderated
--     table like this; products and catalogues both default to 'under_review'.
--     A vendor did not even have to try — omitting the field published them.
--     The single thing keeping moderation working was createProductVideo()
--     passing status:'under_review' explicitly from the client, which is not
--     a security boundary.
--
--  2. product_videos had no triggers at all, while products has
--     trg_products_moderation. RLS (pvideos_write) only constrains
--     vendor_id = auth.uid(); it says nothing about status, and a WITH CHECK
--     clause is the wrong place to express "which transitions are legal"
--     anyway. That belongs in a BEFORE trigger, which is where products
--     already puts it.
--
-- pvideos_write, pvideos_select and approve_vendor_content are deliberately
-- untouched here.

alter table public.product_videos
  alter column status set default 'under_review'::product_status;

-- Modelled directly on public.enforce_products_moderation(), minus the
-- rejection_reason clauses — product_videos has no such column yet.
create or replace function public.enforce_product_videos_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Only constrain the `authenticated` role. Service-role/back-office writes
  -- and SECURITY DEFINER routines run as their owner, which is how
  -- approve_vendor_content() (owned by postgres) is still able to flip a row
  -- to 'live'. Same escape hatch enforce_products_moderation() relies on.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Silently downgrade rather than raise: a vendor asking for 'live' is the
    -- normal, non-malicious case (the client used to send it), and failing the
    -- whole upload after the bytes have already reached storage would strand
    -- an orphaned object with no row pointing at it.
    if new.status not in ('draft', 'under_review')
       and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.status := 'under_review';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      -- A vendor may withdraw their own reel back to draft, or resubmit it for
      -- review. Anything else — 'live' above all — is a moderator decision.
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set product video status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      raise exception 'Product video moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- Same timing as trg_products_moderation: BEFORE INSERT OR UPDATE, per row.
drop trigger if exists trg_product_videos_moderation on public.product_videos;
create trigger trg_product_videos_moderation
  before insert or update on public.product_videos
  for each row execute function public.enforce_product_videos_moderation();
