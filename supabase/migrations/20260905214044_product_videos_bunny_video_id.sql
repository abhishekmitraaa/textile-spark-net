-- Bunny Stream migration, schema half.
--
-- `provider` already exists (20260730205449) and has no CHECK constraint, so
-- writing 'bunny' into it needs no schema change at all — that was the point of
-- the column. This adds the one thing the provider column cannot carry: the
-- identifier Bunny knows the asset by.
--
-- WHY STORE THE GUID WHEN video_url ALREADY CONTAINS IT
-- The GUID is a path segment of the playback URL, so it is technically
-- recoverable by parsing. Storing it separately is deliberate:
--
--   1. Deletion. Removing a video from Bunny is `DELETE /library/{id}/videos/
--      {guid}` — an API call, not a URL fetch. Parsing the id back out of a
--      display URL to perform a destructive call means the URL format becomes
--      load-bearing for deletion, and the day it changes, every vendor delete
--      silently leaks paid storage instead of failing loudly.
--   2. Format changes without a backfill. We store `play_720p.mp4` today
--      because MP4 fallback is enabled and the reel's <video> element wants a
--      plain file. Switching to HLS (`playlist.m3u8`) later, or moving to a
--      different delivery hostname, is then a rebuild from the GUID rather than
--      a re-upload.
--   3. Reconciliation. The Bunny-side orphan check diffs the library's video
--      list against this column. A parse-based diff would report every row
--      whose URL shape drifted as an orphan — i.e. would propose deleting live
--      videos.
--
-- Nullable, and null for every 'supabase'-provider row including the one
-- existing reference row, which is deliberately not backfilled or touched.
alter table public.product_videos
  add column if not exists bunny_video_id text;

comment on column public.product_videos.bunny_video_id is
  'Bunny Stream video GUID for provider=''bunny'' rows; null for provider=''supabase''. The stable identity of the asset at the provider: video_url/thumbnail_url are derived display URLs that may change format, this does not. Deletion and orphan reconciliation both key off this, never off parsing the URL.';

-- Not a CHECK constraint on provider, and not an enum. Left as free text on
-- purpose: the whole design intent recorded in 20260730205449's column comment
-- is that adding a delivery backend is a data change. A CHECK would make the
-- next provider a migration again, which is the thing that column exists to
-- avoid.
--
-- The partial index is for the reconciliation diff and the delete path, both of
-- which look a row up by GUID. It stays small: only bunny rows are indexed.
create index if not exists product_videos_bunny_video_id_idx
  on public.product_videos (bunny_video_id)
  where bunny_video_id is not null;
