-- Re-seed the two production demo test accounts the check scripts sign in as (Mitra, 2026-11-20: "Re-seed them").
-- They had drifted behind the sign-up and registration rules:
--   demo-buyer  (11111111-…) was onboarded with no Terms record, so the buyer Terms gate (review M-61) refused its
--               test conversation and scripts/contact-gate-check.mjs stopped;
--   demo-vendor (22222222-…) wasn't a registered seller, so call_buyer_contact() answered not_a_vendor and three
--               checks of scripts/profile-contact-privacy-check.mjs failed.
-- Run once with the CLI (supabase db query --linked -f). Safe to run again. demo-vendor has no live listings, so a
-- buyer sees nothing new.

begin;

-- demo-buyer: the current Terms accepted, as accept_buyer_terms() records it (tests/local/stack.ts writes the same).
insert into public.terms_acceptances (profile_id, terms_version, source)
select '11111111-1111-1111-1111-111111111111', public.buyer_terms_version(), 'reaccept'
 where not exists (select 1 from public.terms_acceptances a
                    where a.profile_id = '11111111-1111-1111-1111-111111111111'
                      and a.terms_version = public.buyer_terms_version());
update public.profiles
   set terms_version = public.buyer_terms_version(), terms_accepted_at = coalesce(terms_accepted_at, now())
 where id = '11111111-1111-1111-1111-111111111111'
   and terms_version is distinct from public.buyer_terms_version();

-- demo-vendor: a registered seller, with the Supplier Agreement on file as submit_vendor_registration() would leave it
-- (code review: registered with no contract is a state a real registration can't reach). The agreement version is
-- SUPPLIER_AGREEMENT_VERSION (src/lib/supplierAgreement.ts); a test account, so no drawn signature.
insert into public.vendor_contracts (vendor_id, signed_name, signature_url, agreement_version)
select '22222222-2222-2222-2222-222222222222', 'Demo Vendor (test account)', null, '2026-09-v1'
 where not exists (select 1 from public.vendor_contracts c
                    where c.vendor_id = '22222222-2222-2222-2222-222222222222' and c.agreement_version = '2026-09-v1');
update public.vendor_profiles set onboarding_complete = true
 where id = '22222222-2222-2222-2222-222222222222' and onboarding_complete is distinct from true;

do $check$
begin
  if not exists (select 1 from public.profiles p where p.id = '11111111-1111-1111-1111-111111111111'
                  and p.onboarded and p.terms_version = public.buyer_terms_version()) then
    raise exception 'demo reseed: demo-buyer has no current Terms';
  end if;
  if not exists (select 1 from public.vendor_profiles v where v.id = '22222222-2222-2222-2222-222222222222' and v.onboarding_complete) then
    raise exception 'demo reseed: demo-vendor is not registered';
  end if;
  if not exists (select 1 from public.vendor_contracts c where c.vendor_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'demo reseed: demo-vendor has no Supplier Agreement on file';
  end if;
  if exists (select 1 from public.products x where x.vendor_id = '22222222-2222-2222-2222-222222222222' and x.status = 'live') then
    raise notice 'demo reseed: demo-vendor has live listings (buyers can see them)';
  end if;
end
$check$;

commit;
