-- Server-side enforcement for video uploads, plus the metadata the client can
-- now extract at upload time.
--
-- Until now the only limit was a 200MB check in UploadVideo.tsx, which is
-- trivially bypassed by posting straight at the storage API. On the Free plan
-- the whole org shares a 5GB/month egress budget across database, auth AND
-- storage, so a single oversized file is not just a slow page -- sustained
-- traffic on it can 402 the entire project.

-- 50MB. This is the Free-plan ceiling: a bucket limit cannot exceed the
-- project's global file size limit, and on Free that global limit cannot be
-- raised above 50MB. Bump both (dashboard first, then here) after upgrading.
--
-- The image MIME types are load-bearing, not incidental: posters are written to
-- THIS SAME bucket by createProductVideo. With a video-only allowlist the
-- poster upload throws *after* the video object has already been created,
-- leaving an orphaned file and no database row -- every upload would
-- half-succeed.
--
-- video/quicktime is deliberately absent. An iPhone's default .mov is HEVC,
-- which plays on Safari and fails on Chrome/Android -- i.e. most buyers here --
-- and there is no transcoding step to rescue it.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['video/mp4', 'video/webm', 'image/jpeg', 'image/webp']
 where id = 'product-videos';

alter table public.product_videos
  add column if not exists duration_seconds int,
  add column if not exists video_width int,
  add column if not exists video_height int,
  add column if not exists provider text not null default 'supabase';

comment on column public.product_videos.duration_seconds is
  'Clip length, probed client-side at upload. Powers the duration badge on the vendor card and gives moderation a signal.';
comment on column public.product_videos.video_width is
  'Intrinsic video width, probed at upload. Lets the viewer reserve the right aspect and avoid layout shift.';
comment on column public.product_videos.video_height is
  'Intrinsic video height. Portrait (9:16) is what the reel viewer expects.';
comment on column public.product_videos.provider is
  'Where the media is hosted: ''supabase'' today. The exit ramp to a streaming provider (Cloudflare/Bunny) -- the viewer branches on this to decide whether video_url is a plain MP4 or an HLS manifest, so migrating is a data change rather than a rewrite.';
