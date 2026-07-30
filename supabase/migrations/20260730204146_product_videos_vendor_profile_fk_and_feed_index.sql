-- 1. Second FK so PostgREST can embed the vendor's brand name in one round-trip.
--
-- product_videos.vendor_id already FKs to profiles(id), which is exactly why
-- fetchVideoCloseUps had to issue a SECOND query against vendor_profiles just to
-- resolve brand names, then join in memory. vendor_profiles.id is itself the
-- profile id, so the same column satisfies both constraints.
--
-- A FK is the right fix here rather than denormalising brand_name onto
-- product_videos: copying the name would create a permanent sync obligation
-- (vendor renames their brand -> every video card goes stale) to buy something
-- the constraint gives for free.
--
-- Because profiles and vendor_profiles are distinct tables, PostgREST sees
-- exactly one relationship between product_videos and vendor_profiles, so the
-- embed needs no !constraint disambiguation hint.
alter table public.product_videos
  add constraint product_videos_vendor_profile_fkey
  foreign key (vendor_id) references public.vendor_profiles(id) on delete cascade;

-- 2. Partial index matching the buyer feed query exactly:
--      where status = 'live' order by views_count desc
-- No measurable effect at today's row counts; it is the right index once the
-- table is large, and it costs nothing to add now.
create index if not exists product_videos_live_views_idx
  on public.product_videos (views_count desc)
  where status = 'live';
