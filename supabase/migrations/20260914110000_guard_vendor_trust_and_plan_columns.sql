-- ─────────────────────────────────────────────────────────────────────────────
-- A VENDOR COULD GIVE THEMSELVES THE TRUST BADGE AND A SEARCH BOOST, FOR FREE.
--
-- Found 2026-09-14 while re-verifying the entitlement model for the Ads v4
-- billing change. Not introduced by that change — this has been open since
-- `vprofiles_update` was written.
--
-- `vprofiles_update` admits `id = auth.uid()` with NO column restriction, so a
-- signed-in vendor could PATCH their own vendor_profiles row and set:
--
--   ad_verified_until  -> the TrustedSEAL / verified badge, for as long as they like
--   plan_expires_at    -> the same badge by a second route, AND a search boost
--   plan_id            -> which tier that search boost is worth
--
-- Proven live before this migration, rolled back, measured by what PERSISTED
-- rather than by whether the statement raised:
--
--   BEFORE: is_verified=true plan_id=gold  ad_verified_until=2026-10-13
--   flip is_verified          -> refused (42501)      <- already guarded
--   set plan_id = 'vip'       -> no exception raised
--   extend ad_verified_until  -> no exception raised
--   AFTER : is_verified=true plan_id=vip   ad_verified_until=2036-09-14
--
-- WHY IT MATTERS, precisely:
--   * src/lib/plan.ts trustSealFromParts(is_verified, plan_expires_at,
--     ad_verified_until) renders the badge if ANY of the three is set, and the
--     badge is drawn on every product card, the vendor profile and search
--     results. Two of those three were self-settable.
--   * src/lib/queries/products.ts calls vendorBoost(boosts, plan_id,
--     plan_expires_at) and feeds the result into search ranking, so a vendor
--     could also promote themselves up the results by declaring a tier.
--
-- Entitlements were NOT affected: get_vendor_plan() resolves the effective plan
-- from `vendor_subscriptions`, not from vendor_profiles.plan_id, so product
-- caps, lead caps and ad_location_scope were never bypassable this way. The
-- exposure is the trust badge and search ranking — which, for a marketplace
-- whose whole proposition is verified suppliers, is the part that matters most.
--
-- THE FIX extends the trigger that already guards `is_verified`, `rating_avg`
-- and `reviews_count` — the pattern and its reasoning already existed, these
-- three columns were simply never added to it.
--
-- What still works, by construction:
--   * grant_ad_verification() is SECURITY DEFINER owned by postgres, so
--     `current_user` is the owner and the short-circuit at the top lets it
--     through. Approving a campaign still grants the badge.
--   * Edge functions and subscription activation run as service_role — same
--     short-circuit.
--   * super_admin / vendor_ops may still set all three by hand.
--   * Ordinary vendor profile editing never touched these columns: verified by
--     grepping every client write to vendor_profiles (vendorStore.ts,
--     vendorOnboarding.ts, vendorDashboard.ts, Subscription.tsx) — none of them
--     sends plan_id, plan_expires_at or ad_verified_until. Zero regression risk.
--
-- Additive: no schema change, one function body replaced.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_vendor_profile_admin_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- service_role, and any SECURITY DEFINER function owned by postgres
  -- (grant_ad_verification, the subscription activation path), pass through.
  -- Only a directly signed-in client is constrained here.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
      new.is_verified := false;
      -- A brand-new vendor has bought nothing. Whatever the payload claims,
      -- they start with no badge and no plan; the real ones are written later
      -- by approve_ad_campaign() and by subscription activation.
      new.ad_verified_until := null;
      new.plan_id           := null;
      new.plan_expires_at   := null;
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

  -- The paid trust badge. Written by grant_ad_verification() when a campaign is
  -- APPROVED — never by the vendor who would be wearing it.
  if new.ad_verified_until is distinct from old.ad_verified_until
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'The verification badge is granted when an admin approves a campaign; it cannot be set directly'
      using errcode = '42501';
  end if;

  -- Subscription tier and expiry. These feed the search-ranking boost and, via
  -- trustSealFromParts, the badge as well. Owned by the subscription path.
  if (new.plan_id is distinct from old.plan_id
      or new.plan_expires_at is distinct from old.plan_expires_at)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Subscription tier and expiry are set by the subscription system and cannot be edited directly'
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
$$;
