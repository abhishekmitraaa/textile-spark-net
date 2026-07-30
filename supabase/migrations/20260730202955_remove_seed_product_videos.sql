-- Remove the 7 demo rows that shipped with the original `seed_product_videos`
-- work (2026-07-04, never checked in as a tracked migration).
--
-- Every one pointed at a Google sample film on storage.googleapis.com --
-- Blender's Sintel, a car rally, "ForBiggerBlazes" -- presented as Indian
-- textile product closeups. They are 16:9 landscape inside a 9:16 portrait
-- reel, and Sintel (~600MB) carried the highest views_count so it sorted into
-- slot 0 of the buyer feed and eagerly preloaded, which made any performance
-- measurement of the video feed meaningless.
--
-- Safe to delete outright: nothing references product_videos.
--   select ... from pg_constraint where contype='f' and confrelid='product_videos'::regclass
--   -> 0 rows
-- Vendor profiles and their real seeded products are untouched; only the video
-- rows go. This is deliberate and NOT reversible by re-running anything saved,
-- since the original inserts were never tracked. A populated demo state, if
-- ever wanted again, should be added as a real migration file.

delete from public.product_videos
 where id in (
   'c0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000004',
   'c0000000-0000-0000-0000-000000000005',
   'c0000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-000000000007'
 );
