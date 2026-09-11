-- Master Prompt 8, Phase 2 — vendor review aggregates: truthful, and writable
-- only by the reviews trigger.
--
-- vendor_profiles.rating_avg / reviews_count are maintained by
-- sync_vendor_rating() (AFTER INSERT/UPDATE/DELETE ON reviews). That trigger
-- only runs when a review is written, so the four seeded vendors that never
-- received one kept their invented seed values — "Lucknow Chikankari Co."
-- showed 4,800 reviews against 0 rows in `reviews`; Delhi Fashion Hub 318,
-- Jaipur Weaves 192, Mumbai Linen House 147, all against 0.
--
-- And nothing stopped a vendor writing the numbers directly: vprofiles_update
-- admits id = auth.uid(), and enforce_vendor_profile_admin_fields() guarded
-- only is_verified. Proven 2026-09-11 as demo-vendor: an update setting its own
-- reviews_count 5 -> 10004 and rating_avg -> 5 was accepted (then reverted).
--
-- 1. Recompute every row with sync_vendor_rating()'s own formula.
-- 2. Refuse any signed-in write to either column. sync_vendor_rating() is
--    SECURITY DEFINER, so it runs as the owner and never reaches the check —
--    it stays the one writer, the same "one number, one writer" rule the
--    profile score follows.

update public.vendor_profiles vp
   set rating_avg    = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.vendor_id = vp.id), 0),
       reviews_count = (select count(*) from public.reviews r where r.vendor_id = vp.id);

create or replace function public.enforce_vendor_profile_admin_fields()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
      new.is_verified := false;
    end if;
    -- A new vendor has no reviews. Whatever the payload says, start at zero;
    -- sync_vendor_rating() moves these once a real review exists.
    new.rating_avg    := 0;
    new.reviews_count := 0;
    return new;
  end if;

  -- UPDATE
  if new.is_verified is distinct from old.is_verified
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Changing vendor verification requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;

  -- Computed from `reviews` by sync_vendor_rating(). No one signed in, vendor
  -- or admin, sets them by hand: an admin who could would be editing a
  -- vendor's reputation, which is the same fabrication from the other side.
  if new.rating_avg is distinct from old.rating_avg
     or new.reviews_count is distinct from old.reviews_count then
    raise exception 'rating_avg and reviews_count are computed from reviews and cannot be set directly'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
