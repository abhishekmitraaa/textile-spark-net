-- ─────────────────────────────────────────────────────────────
-- Make the trustedSeal / verifiedCertificate ad types actually grant something.
--
-- Buying one now writes a time-bound verification tied to the campaign's end
-- date (unlike the subscription-driven seal, which follows the plan period).
-- The displayed buyer trust seal becomes:
--   vendor_profiles.is_verified            (admin/manual)
--   OR active paid plan (plan_expires_at)  (subscription tier)
--   OR active ad verification (ad_verified_until)  ← new
--
-- ad_verified_until is the denormalised max(active expires_at), so buyer-facing
-- reads (which already read vendor_profiles) need no extra join. The
-- vendor_ad_verifications table is the source of record.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.vendor_ad_verifications (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendor_profiles(id) on delete cascade,
  source     text not null check (source in ('trustedSeal','verifiedCertificate')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists vendor_ad_verifications_vendor_idx on public.vendor_ad_verifications(vendor_id, expires_at desc);

alter table public.vendor_profiles
  add column if not exists ad_verified_until timestamptz;

alter table public.vendor_ad_verifications enable row level security;
drop policy if exists vendor_ad_verifications_select on public.vendor_ad_verifications;
create policy vendor_ad_verifications_select on public.vendor_ad_verifications
  for select using ((vendor_id = auth.uid()) or is_admin());

-- Insert a verification + refresh the denormalised cache. Service-role only
-- (called from the ad publish path in the edge functions).
create or replace function public.grant_ad_verification(v uuid, src text, exp timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  insert into public.vendor_ad_verifications (vendor_id, source, expires_at) values (v, src, exp);
  update public.vendor_profiles
     set ad_verified_until = (
       select max(expires_at) from public.vendor_ad_verifications
        where vendor_id = v and expires_at > now()
     )
   where id = v;
end;
$$;

revoke execute on function public.grant_ad_verification(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_ad_verification(uuid, text, timestamptz) to service_role;
