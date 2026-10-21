-- Follow-up to 20261021100000 (vendor audit, serious #3), from the security reviews of its commit and push.
--
--   1. storage_url_plain judged "does this look like a Storage address?" on the raw text. A browser reads `\`
--      as `/` and drops tabs and newlines, and the server decodes percent-encoding, so
--      `http://host\storage\v1\object\public\product-images\…\x.jpg?v=1`, `/stor<TAB>age/` or `/%73torage/`
--      passed as an outside link yet loaded Cosora's file, which the in-use check then didn't see: the file
--      could be swapped after review. It now decides on a normalised copy (percent-decoded until stable,
--      `\` read as `/`, control characters and whitespace dropped, lower case): anything that mentions
--      supabase or storage…v1 must be the plain address.
--   2. A listing, catalogue or video could link another seller's file (a stolen photo), and that also made the
--      file "in use", so its owner couldn't replace it. Such a link must now be in the row owner's own folder,
--      and storage_object_in_use counts only links from the folder's owner.
--
-- Every row on production on 2026-10-21 passes both (checked before writing this).

do $pin$
begin
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.storage_url_plain(text,text)'::regprocedure), chr(13), ''))
     <> '70eee404e2a0e68b8abe5119fb482f2a' then
    raise exception 'pre-check: public.storage_url_plain is not the version this migration was written against';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.storage_object_in_use(text,text)'::regprocedure), chr(13), ''))
     <> '8523a362cfaf564363cf452d476335fb' then
    raise exception 'pre-check: public.storage_object_in_use is not the version this migration was written against';
  end if;
  if to_regprocedure('admin.product_images_own_folder()') is not null then
    raise exception 'pre-check: admin.product_images_own_folder already exists';
  end if;
end
$pin$;

-- ── 1 ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_url_plain(p_url text, p_bucket text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v    text := p_url;
  prev text;
  n    text;
begin
  if p_url is null then
    return true;
  end if;
  -- Percent-decoded until nothing changes (at most 4 rounds; %00 is dropped).
  for i in 1..4 loop
    prev := v;
    v := coalesce((
      select string_agg(case when m[1] is not null
                             then case when m[1] = '00' then '' else chr(('x' || m[1])::bit(8)::int) end
                             else m[2] end, '' order by ord)
        from regexp_matches(v, '%([0-9A-Fa-f]{2})|([^%]+|%)', 'g') with ordinality as t(m, ord)), '');
    exit when v = prev;
  end loop;
  n := lower(regexp_replace(translate(v, '\', '/'), '[[:cntrl:][:space:]]', '', 'g'));
  if position('supabase' in n) = 0 and position('storagev1' in regexp_replace(n, '[^a-z0-9]', '', 'g')) = 0 then
    return true; -- an outside address (a CSV import's photo link)
  end if;
  return p_url ~ ('^https?://[A-Za-z0-9.:-]+/storage/v1/object/public/' || p_bucket || '/[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)+$')
     and p_url !~ '/\.\.?(/|$)';
end
$function$;

-- ── 2 ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- The folder a plain Storage address is in (its owner's id), or null for any other address.
create function public.storage_url_folder(p_url text, p_bucket text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select substring(p_url from ('^https?://[A-Za-z0-9.:-]+/storage/v1/object/public/' || p_bucket || '/([A-Za-z0-9_-]+)/'))
$function$;

-- Counted as in use only by a row of the folder's owner.
CREATE OR REPLACE FUNCTION public.storage_object_in_use(p_bucket text, p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with s as (select '/storage/v1/object/public/' || p_bucket || '/' || p_name as tail,
                    split_part(p_name, '/', 1) as owner)
  select case p_bucket
    when 'product-images' then exists (
      select 1 from public.product_images pi join public.products p on p.id = pi.product_id, s
       where right(pi.url, length(s.tail)) = s.tail and p.vendor_id::text = s.owner)
    when 'catalogues' then exists (
      select 1 from public.catalogues c, s
       where c.vendor_id::text = s.owner
         and (right(c.file_url, length(s.tail)) = s.tail or right(c.cover_url, length(s.tail)) = s.tail))
    when 'product-videos' then exists (
      select 1 from public.product_videos v, s
       where v.vendor_id::text = s.owner
         and (right(v.video_url, length(s.tail)) = s.tail or right(v.thumbnail_url, length(s.tail)) = s.tail))
    else false
  end
$function$;

-- A listing photo in Cosora's Storage is in the listing's seller's folder.
create function admin.product_images_own_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_folder text := public.storage_url_folder(new.url, 'product-images');
begin
  if v_folder is not null
     and v_folder is distinct from (select p.vendor_id::text from public.products p where p.id = new.product_id) then
    raise exception 'A listing''s photo must be one of its seller''s own uploads.' using errcode = '42501';
  end if;
  return new;
end
$function$;
revoke all on function admin.product_images_own_folder() from public, anon, authenticated;

create trigger trg_product_images_own_folder
  before insert or update of url, product_id on public.product_images
  for each row execute function admin.product_images_own_folder();

alter table public.catalogues
  add constraint catalogues_urls_own_folder check (
    coalesce(public.storage_url_folder(file_url, 'catalogues'), vendor_id::text) = vendor_id::text
    and coalesce(public.storage_url_folder(cover_url, 'catalogues'), vendor_id::text) = vendor_id::text);
alter table public.product_videos
  add constraint product_videos_urls_own_folder check (
    coalesce(public.storage_url_folder(video_url, 'product-videos'), vendor_id::text) = vendor_id::text
    and coalesce(public.storage_url_folder(thumbnail_url, 'product-videos'), vendor_id::text) = vendor_id::text);

-- ── Self-checks ────────────────────────────────────────────────────────────────────────────────────────────
do $check$
declare
  v_base text := 'https://x.supabase.co/storage/v1/object/public/product-images/a/b.jpg';
  v_bad  text[] := array[
    'https://x.supabase.co\storage\v1\object\public\product-images\a\b.jpg?v=1',
    'https://h/stor' || chr(9) || 'age/v1/object/public/product-images/a/b.jpg?v=1',
    'https://h/st' || chr(10) || 'orage/v1/object/public/product-images/a/b.jpg?v=1',
    'https://h/%73torage/v1/object/public/product-images/a/b.jpg?v=1',
    'https://h/%2573torage/v1/object/public/product-images/a/b.jpg?v=1',
    'https://h/storage%2Fv1/object/public/product-images/a/b.jpg?v=1',
    'https://x.supabase%2Eco/x.jpg',
    v_base || '?v=1'];
  v_u text;
begin
  foreach v_u in array v_bad loop
    if public.storage_url_plain(v_u, 'product-images') then
      raise exception 'self-check: storage_url_plain accepts %', v_u;
    end if;
  end loop;
  if not public.storage_url_plain(v_base, 'product-images')
     or not public.storage_url_plain('https://images.unsplash.com/photo-1?w=500&h=650', 'product-images')
     or not public.storage_url_plain(null, 'product-images') then
    raise exception 'self-check: storage_url_plain refuses a good address';
  end if;
  if public.storage_url_folder(v_base, 'product-images') is distinct from 'a'
     or public.storage_url_folder('https://images.unsplash.com/a/b.jpg', 'product-images') is not null then
    raise exception 'self-check: storage_url_folder answers wrongly';
  end if;
  -- The existing rows, against the stricter rule (replacing the function doesn't re-check them).
  if exists (select 1 from public.product_images where not public.storage_url_plain(url, 'product-images'))
     or exists (select 1 from public.catalogues where not public.storage_url_plain(file_url, 'catalogues')
                                                   or not public.storage_url_plain(cover_url, 'catalogues'))
     or exists (select 1 from public.product_videos where not public.storage_url_plain(video_url, 'product-videos')
                                                       or not public.storage_url_plain(thumbnail_url, 'product-videos')) then
    raise exception 'self-check: an existing row is not plain under the stricter rule';
  end if;
  if exists (select 1 from public.product_images pi join public.products p on p.id = pi.product_id
              where public.storage_url_folder(pi.url, 'product-images') <> p.vendor_id::text) then
    raise exception 'self-check: a product_images row links another seller''s folder';
  end if;
  if (select count(*) from pg_constraint where conname in ('catalogues_urls_own_folder', 'product_videos_urls_own_folder') and convalidated) <> 2 then
    raise exception 'self-check: the own-folder constraints are missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_product_images_own_folder' and tgrelid = 'public.product_images'::regclass) then
    raise exception 'self-check: trg_product_images_own_folder is missing';
  end if;
end
$check$;
