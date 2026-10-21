-- The 2026-10-21 vendor audit's serious list, database half (Mitra: "fix the first 5 serious issues").
--
--   #3 A picture a listing, catalogue or video uses can't be overwritten or replaced in Storage. Overwriting
--      the file at an approved photo's path (upsert, or remove + upload again) changed what buyers saw while
--      the listing stayed live: no trigger watches storage.objects, and the product_images row (which does
--      send a listing back to review when it changes) stayed the same. The owner's insert and update policies
--      on product-images, catalogues and product-videos now refuse a path that one of those rows points at.
--      A picture nothing uses (a store logo, a review photo, a requirement photo) is unchanged. Removing a
--      file is unchanged too: that only breaks the picture, it can't swap it. Those rows may point at Cosora's
--      Storage only by the plain address (storage_url_plain), so the in-use check can't be dodged.
--   #4 The public buckets product-images, avatars and catalogues had no size limit and no type list, so any
--      signed-in account could keep any file there (a 20 MB binary was accepted). Now: product-images and
--      avatars take pictures of at most 10 MB, catalogues PDFs and cover pictures of at most 20 MB (the
--      sizes the upload forms already state). No SVG: a public SVG can carry script.
--   #5 A seller can't quote their own requirement (posted as a buyer). enforce_quote_rfq_open refused a closed,
--      expired or someone else's direct request, but not one the seller posted, so a seller could quote it
--      and accept it as the buyer. An existing such quote is left as it is.
--
-- Pre-checks stop the file if enforce_quote_rfq_open or any of the six storage policies isn't the version
-- this was written against.

do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.enforce_quote_rfq_open()'::regprocedure), chr(13), ''))
     <> '7ba32ec30b852d3d41acb78ac30aa6a0' then
    raise exception 'pre-check: public.enforce_quote_rfq_open() is not the version this migration was written against';
  end if;
  -- md5(USING || '|' || WITH CHECK) of each policy, read on production and the local stack on 2026-10-21.
  if (select string_agg(polname || '=' || md5(coalesce(pg_get_expr(polqual, polrelid), '') || '|'
                                             || coalesce(pg_get_expr(polwithcheck, polrelid), '')), ', ' order by polname)
        from pg_policy
       where polrelid = 'storage.objects'::regclass
         and polname in ('product_images_owner_insert', 'product_images_owner_update',
                         'catalogues_owner_insert', 'catalogues_owner_update',
                         'product_videos_owner_insert', 'product_videos_owner_update'))
     is distinct from 'catalogues_owner_insert=d14dd665d90e0da8444b509c83d1d3f2, catalogues_owner_update=7a7dbe24e07a02aa39ebe288681af17e, '
                   || 'product_images_owner_insert=75ae526c9b57654a289eb88f69918ec6, product_images_owner_update=aebb21a93019694b81f38c4a527a3b19, '
                   || 'product_videos_owner_insert=0962b52efff37e9463849398db335c40, product_videos_owner_update=2e0e793ff3dcc961e837cf1c0d14f989' then
    raise exception 'pre-check: the owner insert/update policies on storage.objects are not the versions this migration was written against';
  end if;
  if to_regprocedure('public.storage_object_in_use(text,text)') is not null
     or to_regprocedure('public.storage_url_plain(text,text)') is not null then
    raise exception 'pre-check: storage_object_in_use or storage_url_plain already exists';
  end if;
end
$pin$;

-- ── #3 ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Whether a moderated row points at this Storage object. Matched on the URL's end, so it holds whatever the
-- project's host is. Definer: the caller can't read other people's rows, and needn't.
create function public.storage_object_in_use(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with s as (select '/storage/v1/object/public/' || p_bucket || '/' || p_name as tail)
  select case p_bucket
    when 'product-images' then exists (
      select 1 from public.product_images pi, s where right(pi.url, length(s.tail)) = s.tail)
    when 'catalogues' then exists (
      select 1 from public.catalogues c, s
       where right(c.file_url, length(s.tail)) = s.tail or right(c.cover_url, length(s.tail)) = s.tail)
    when 'product-videos' then exists (
      select 1 from public.product_videos v, s
       where right(v.video_url, length(s.tail)) = s.tail or right(v.thumbnail_url, length(s.tail)) = s.tail)
    else false
  end
$function$;

revoke all on function public.storage_object_in_use(text, text) from public, anon;
grant execute on function public.storage_object_in_use(text, text) to authenticated, service_role;

-- The match above is on the plain address, so a moderated row may only point at Cosora's Storage by that
-- spelling: the right bucket's /object/public/ path, letters, digits, '.', '_' and '-' in each segment, no
-- dot segments, no query, fragment or percent-encoding. Otherwise a seller could link `…/x.jpg?v=1` (which
-- loads x.jpg), get it approved, and then overwrite x.jpg, which the check wouldn't see as in use (security
-- review of this migration). Anything that looks like a Storage address counts: a /storage/v1/ path in any
-- case or encoding, or a supabase.co / supabase.in host. Other addresses (a CSV import's photo links) are
-- unchanged. Everything the app writes, and every row on production on 2026-10-21, is already plain.
create function public.storage_url_plain(p_url text, p_bucket text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_url is null
      or (lower(p_url) !~ '/storage(/|%2f)v1(/|%2f)'
          and lower(p_url) !~ '^[a-z][a-z0-9+.-]*://([^/?#@]*@)?[^/?#:]*supabase\.(co|in)\.?(:[0-9]+)?([/?#]|$)')
      or (p_url ~ ('^https?://[A-Za-z0-9.:-]+/storage/v1/object/public/' || p_bucket || '/[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)+$')
          and p_url !~ '/\.\.?(/|$)')
$function$;

alter table public.product_images
  add constraint product_images_url_plain check (public.storage_url_plain(url, 'product-images'));
alter table public.catalogues
  add constraint catalogues_urls_plain check (public.storage_url_plain(file_url, 'catalogues')
                                              and public.storage_url_plain(cover_url, 'catalogues'));
alter table public.product_videos
  add constraint product_videos_urls_plain check (public.storage_url_plain(video_url, 'product-videos')
                                                  and public.storage_url_plain(thumbnail_url, 'product-videos'));

-- The owner's own folder, as before, and not a path a listing, catalogue or video uses. On update the old
-- path (USING) and the new one (WITH CHECK) are both checked, so a move onto a used path is refused too.
alter policy product_images_owner_insert on storage.objects
  with check ((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
              AND ( SELECT public.account_not_deleted(( SELECT auth.uid() AS uid)) AS account_not_deleted)
              AND (NOT public.storage_object_in_use(bucket_id, name)));
alter policy product_images_owner_update on storage.objects
  using ((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
         AND (NOT public.storage_object_in_use(bucket_id, name)))
  with check ((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
              AND ( SELECT public.account_not_deleted(( SELECT auth.uid() AS uid)) AS account_not_deleted)
              AND (NOT public.storage_object_in_use(bucket_id, name)));

alter policy catalogues_owner_insert on storage.objects
  with check ((bucket_id = 'catalogues'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
              AND ( SELECT public.account_not_deleted(( SELECT auth.uid() AS uid)) AS account_not_deleted)
              AND (NOT public.storage_object_in_use(bucket_id, name)));
alter policy catalogues_owner_update on storage.objects
  using ((bucket_id = 'catalogues'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
         AND (NOT public.storage_object_in_use(bucket_id, name)))
  with check ((bucket_id = 'catalogues'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
              AND ( SELECT public.account_not_deleted(( SELECT auth.uid() AS uid)) AS account_not_deleted)
              AND (NOT public.storage_object_in_use(bucket_id, name)));

alter policy product_videos_owner_insert on storage.objects
  with check ((bucket_id = 'product-videos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
              AND ( SELECT public.account_not_deleted(( SELECT auth.uid() AS uid)) AS account_not_deleted)
              AND (NOT public.storage_object_in_use(bucket_id, name)));
alter policy product_videos_owner_update on storage.objects
  using ((bucket_id = 'product-videos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
         AND (NOT public.storage_object_in_use(bucket_id, name)))
  with check ((bucket_id = 'product-videos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
              AND ( SELECT public.account_not_deleted(( SELECT auth.uid() AS uid)) AS account_not_deleted)
              AND (NOT public.storage_object_in_use(bucket_id, name)));

-- ── #4 ─────────────────────────────────────────────────────────────────────────────────────────────────────
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']
 where id in ('product-images', 'avatars');
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']
 where id = 'catalogues';

-- ── #5 ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_quote_rfq_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r_status   public.rfq_status;
  r_target   uuid;
  r_buyer    uuid;
  r_overseas boolean;
  r_until    timestamptz;
  r_expires  timestamptz;
  v_tier     text;
begin
  if tg_op = 'UPDATE'
     and new.rfq_id = old.rfq_id and new.vendor_id = old.vendor_id then
    return new;
  end if;

  select r.status, r.vendor_id, r.buyer_id, r.overseas, r.overseas_vip_until, r.expires_at
    into r_status, r_target, r_buyer, r_overseas, r_until, r_expires
    from public.rfqs r
   where r.id = new.rfq_id;

  if not found then
    return new;  -- the rfq_id foreign key refuses it, with its own error
  end if;

  -- A seller's own requirement, posted as a buyer (2026-10-21): quoting it and accepting it made an order
  -- that never was.
  if r_buyer = new.vendor_id then
    raise exception 'You can''t quote on your own requirement.'
      using errcode = '42501';
  end if;

  if r_status <> 'active' then
    raise exception 'This request is closed and is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  -- The 7-day deadline (2026-10-19). The buyer can extend it; until then no new quote.
  if r_expires is not null and r_expires <= now() then
    raise exception 'This request''s deadline has passed and it is no longer accepting quotes.'
      using errcode = 'P0001';
  end if;

  if r_target is not null and r_target <> new.vendor_id then
    raise exception 'This request was sent to a different vendor and cannot be quoted.'
      using errcode = '42501';
  end if;

  -- Overseas requirements (P7): Gold and VIP only, VIP first. One sent to this vendor, or
  -- one they have already quoted on, is theirs to quote.
  if r_overseas and r_target is null
     and not exists (select 1 from public.quotes q where q.rfq_id = new.rfq_id and q.vendor_id = new.vendor_id) then
    v_tier := admin.vendor_overseas_tier(new.vendor_id);
    if not public.overseas_rfq_visible(true, r_until, v_tier) then
      if v_tier = 'gold' then
        raise exception 'This overseas requirement is with VIP sellers first. It opens to Gold on %.',
          to_char(r_until at time zone 'Asia/Kolkata', 'FMDD Mon, HH12:MI AM')
          using errcode = '42501';
      end if;
      raise exception 'Overseas requirements are part of the Gold and VIP plans.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
declare
  v_n int;
begin
  select count(*) into v_n from pg_policy
   where polrelid = 'storage.objects'::regclass
     and polname in ('product_images_owner_insert', 'catalogues_owner_insert', 'product_videos_owner_insert')
     and pg_get_expr(polwithcheck, polrelid) like '%storage_object_in_use%';
  if v_n <> 3 then raise exception 'self-check: % of 3 insert policies call storage_object_in_use', v_n; end if;
  select count(*) into v_n from pg_policy
   where polrelid = 'storage.objects'::regclass
     and polname in ('product_images_owner_update', 'catalogues_owner_update', 'product_videos_owner_update')
     and pg_get_expr(polqual, polrelid) like '%storage_object_in_use%'
     and pg_get_expr(polwithcheck, polrelid) like '%storage_object_in_use%';
  if v_n <> 3 then raise exception 'self-check: % of 3 update policies call storage_object_in_use', v_n; end if;
  if (select prosecdef from pg_proc where oid = 'public.storage_object_in_use(text,text)'::regprocedure) is not true then
    raise exception 'self-check: storage_object_in_use is not security definer';
  end if;
  if has_function_privilege('anon', 'public.storage_object_in_use(text,text)', 'execute') then
    raise exception 'self-check: anon can execute storage_object_in_use';
  end if;
  select count(*) into v_n from storage.buckets
   where (id in ('product-images', 'avatars') and file_size_limit = 10485760 and not ('image/svg+xml' = any(allowed_mime_types)))
      or (id = 'catalogues' and file_size_limit = 20971520 and 'application/pdf' = any(allowed_mime_types));
  if v_n <> 3 then raise exception 'self-check: % of 3 buckets have their limits', v_n; end if;
  select count(*) into v_n from pg_constraint
   where conname in ('product_images_url_plain', 'catalogues_urls_plain', 'product_videos_urls_plain') and convalidated;
  if v_n <> 3 then raise exception 'self-check: % of 3 plain-address constraints', v_n; end if;
  if public.storage_url_plain('https://x.supabase.co/storage/v1/object/public/product-images/a/b.jpg?v=1', 'product-images')
     or public.storage_url_plain('https://x.supabase.co/storage/v1/object/public/product-images/a/./b.jpg', 'product-images')
     or public.storage_url_plain('https://x.supabase.co/storage/v1/object/public/catalogues/a/b.jpg', 'product-images')
     or not public.storage_url_plain('https://x.supabase.co/storage/v1/object/public/product-images/a/b.jpg', 'product-images')
     or not public.storage_url_plain('https://images.unsplash.com/photo-1?w=500', 'product-images') then
    raise exception 'self-check: storage_url_plain answers wrongly';
  end if;
  if position('r_buyer = new.vendor_id' in (select prosrc from pg_proc where oid = 'public.enforce_quote_rfq_open()'::regprocedure)) = 0 then
    raise exception 'self-check: enforce_quote_rfq_open has no own-requirement check';
  end if;
end
$check$;
