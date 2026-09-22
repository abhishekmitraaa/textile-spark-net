-- Master Prompt 9 (buyer-trust thread) — vendor review aggregates: one writer,
-- for EVERY role, not just signed-in users.
--
-- Master Prompt 8 (migration 20260911120000) made vendor_profiles.rating_avg /
-- reviews_count truthful and stopped a signed-in vendor or admin from setting
-- them. But enforce_vendor_profile_admin_fields() opens with
--   if current_user <> 'authenticated' then return new; end if;
-- so anything running as service_role, postgres or a migration could insert
-- any number it liked. On 2026-09-16 17:36:02 UTC a load-test batch did exactly
-- that: 120 "[LOADTEST] Vendor Co N" vendor_profiles (loadtest-*@cosora.test,
-- from the Master Prompt 11 thread; see commit 08a0550), 118 of them with
-- reviews_count = N and an invented rating against 0 rows in `reviews`.
-- 118 of 130 vendor_profiles rows were wrong five days after the fix.
--
-- Mitra's decision (2026-09-22): these columns are never hand-set by anything.
--   INSERT, any role: both are COMPUTED from `reviews`, whatever the payload
--     says. A seed still succeeds; it just cannot fabricate a reputation.
--   UPDATE, any role: changing either raises 42501 unless the change comes
--     from sync_vendor_rating(), which marks its own update with the
--     transaction-local setting cosora.review_aggregate_sync = 'on' and clears
--     it straight after. PostgREST gives clients no way to set it. A privileged
--     session CAN set it on purpose; that is the documented escape hatch (the
--     recompute at the bottom of this file uses it), not an accident.
--
-- Everything else in the function is carried over UNCHANGED from
-- 20260914110000_guard_vendor_trust_and_plan_columns: is_verified,
-- ad_verified_until, plan_id and plan_expires_at are still guarded for
-- signed-in users, and privileged roles are still trusted with them (granting
-- a badge or a plan is an admin/system act, not a computed number).
--
-- The load-test rows themselves are NOT deleted here. Their cleanup belongs to
-- the Master Prompt 11 thread that created them ("Part 3" in 08a0550); Mitra
-- chose to leave it there. Only their review numbers are corrected.

create or replace function public.sync_vendor_rating()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare vid uuid;
begin
  vid := coalesce(new.vendor_id, old.vendor_id);
  -- The one writer of these columns: tell the guard trigger, then take the
  -- permission back before anything else in this transaction runs.
  perform set_config('cosora.review_aggregate_sync', 'on', true);
  update public.vendor_profiles vp
     set rating_avg    = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where vendor_id = vid), 0),
         reviews_count = (select count(*) from public.reviews where vendor_id = vid)
   where vp.id = vid;
  perform set_config('cosora.review_aggregate_sync', '', true);
  return null;
end $function$;

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

  -- Everything below is unchanged from 20260914110000.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
      new.is_verified := false;
      new.ad_verified_until := null;
      new.plan_id           := null;
      new.plan_expires_at   := null;
    end if;
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Changing vendor verification requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;

  if new.ad_verified_until is distinct from old.ad_verified_until
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'The verification badge is granted when an admin approves a campaign; it cannot be set directly'
      using errcode = '42501';
  end if;

  if (new.plan_id is distinct from old.plan_id
      or new.plan_expires_at is distinct from old.plan_expires_at)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Subscription tier and expiry are set by the subscription system and cannot be edited directly'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- Correct every row now, through the same door sync_vendor_rating() uses.
select set_config('cosora.review_aggregate_sync', 'on', true);
update public.vendor_profiles vp
   set rating_avg    = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.vendor_id = vp.id), 0),
       reviews_count = (select count(*) from public.reviews r where r.vendor_id = vp.id);
select set_config('cosora.review_aggregate_sync', '', true);
