-- ─────────────────────────────────────────────────────────────────────────────
-- One picture per category; admin pictures JPEG only, in the database too (2026-10-17)
--
-- Mitra: "a category's picture should be universal throughout the website, as defined by the admin", and "set
-- all the pictures set by the developer and admin to JPEG for fast rendering".
--
-- 1. New Arrivals' "Shop by category" had twelve picture slots of its own (new-arrivals/<key>), so one category
--    could show two different pictures. Its tiles now show their category's /categories tile
--    (src/lib/categoryImageSlots.ts NEW_ARRIVALS_TILES), so the twelve rows go. Production had none of them set
--    (checked 2026-10-17); this refuses to run if one has been set since, rather than drop a picture someone
--    chose. The id and surface checks then admit category slots only.
-- 2. JPEG only. Since 20261016100000 the site-content bucket takes image/jpeg only and the upload policies want
--    .jpg/.jpeg, but the tables and the two save functions still accepted .png/.webp paths. Production had no
--    such path in either table (checked 2026-10-17). Both checks and both functions now say .jpg/.jpeg; the
--    function bodies are production's (pg_get_functiondef, 2026-10-17) with only that pattern changed.
--    Blog pictures are not covered here: the 9 older PNG/WebP blog pictures are re-encoded to JPEG separately
--    (scripts/blog-images-jpeg.mjs) and blog paths have no pattern check.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New Arrivals' own slots
do $$
begin
  if exists (select 1 from public.category_images where id like 'new-arrivals/%' and image_path is not null) then
    raise exception 'A New Arrivals picture is set in Cosora-Admin; clear it (or move it to its category) first.';
  end if;
end $$;

delete from public.category_images where id like 'new-arrivals/%';

alter table public.category_images drop constraint if exists category_images_id;
alter table public.category_images add constraint category_images_id
  check (char_length(id) <= 120 and id ~ '^categories/[a-z0-9-]+(/[a-z0-9-]+)?$');
alter table public.category_images drop constraint if exists category_images_surface;
alter table public.category_images add constraint category_images_surface
  check (surface in ('categories_banner', 'categories_tile'));

-- 2. JPEG only
alter table public.category_images drop constraint if exists category_images_image_path;
alter table public.category_images add constraint category_images_image_path
  check (image_path is null or image_path ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg)$');
alter table public.site_banners drop constraint if exists site_banners_image_path;
alter table public.site_banners add constraint site_banners_image_path
  check (image_path is null or image_path ~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg)$');

CREATE OR REPLACE FUNCTION public.admin_category_image_set(p_slot text, p_image_path text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_img  text := nullif(btrim(coalesce(p_image_path, '')), '');
  v_prev text;
begin
  perform admin.require_category_image_admin();

  select c.image_path into v_prev from public.category_images c where c.id = p_slot for update;
  if not found then
    raise exception 'That picture slot doesn''t exist. Reload the page.' using errcode = 'P0002';
  end if;
  if v_img is not null and v_img !~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg)$' then
    raise exception 'The picture must be a JPEG uploaded from this page.' using errcode = '22023';
  elsif v_img is not null and not exists (select 1 from storage.objects o
                                           where o.bucket_id = 'site-content' and o.name = v_img) then
    raise exception 'That picture isn''t uploaded. Upload it again.' using errcode = '22023';
  end if;

  if v_prev is not distinct from v_img then
    return null;  -- nothing changed, nothing to remove
  end if;

  update public.category_images c
     set image_path = v_img, updated_by = auth.uid(), updated_at = now()
   where c.id = p_slot;
  -- The caller removes the replaced object after this commits (row first, then the object).
  return v_prev;
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_site_banner_save(p_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_subtitle text DEFAULT NULL::text, p_cta_label text DEFAULT NULL::text, p_link_path text DEFAULT NULL::text, p_image_path text DEFAULT NULL::text, p_active boolean DEFAULT true, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_sub   text := nullif(btrim(coalesce(p_subtitle, '')), '');
  v_cta   text := nullif(btrim(coalesce(p_cta_label, '')), '');
  v_link  text := nullif(btrim(coalesce(p_link_path, '')), '');
  v_img   text := nullif(btrim(coalesce(p_image_path, '')), '');
  v_id    uuid;
begin
  perform admin.require_content_admin();

  if v_title is null then
    raise exception 'A banner needs a headline.' using errcode = '22023';
  elsif char_length(v_title) > 80 then
    raise exception 'The headline can be at most 80 characters.' using errcode = '22023';
  elsif char_length(coalesce(v_sub, '')) > 160 then
    raise exception 'The supporting line can be at most 160 characters.' using errcode = '22023';
  elsif char_length(coalesce(v_cta, '')) > 30 then
    raise exception 'The button label can be at most 30 characters.' using errcode = '22023';
  elsif v_cta is not null and v_link is null then
    raise exception 'A button needs a destination path.' using errcode = '22023';
  elsif v_link is not null and (char_length(v_link) > 200 or v_link !~ '^/[^/\\]'
                                or v_link ~ '[[:space:][:cntrl:]<>"''`]') then
    raise exception 'The destination must be a path on Cosora that starts with one "/", like /advertisements.'
      using errcode = '22023';
  elsif v_img is not null and v_img !~ '^banners/[0-9a-f-]{36}\.(jpg|jpeg)$' then
    raise exception 'The image must be a JPEG uploaded from this page.' using errcode = '22023';
  elsif v_img is not null and not exists (select 1 from storage.objects o
                                           where o.bucket_id = 'site-content' and o.name = v_img) then
    raise exception 'That image isn''t uploaded. Upload it again.' using errcode = '22023';
  elsif p_starts_at is not null and p_ends_at is not null and p_starts_at >= p_ends_at then
    raise exception 'The banner must start before it ends.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.site_banners
      (title, subtitle, cta_label, link_path, image_path, active, starts_at, ends_at, position, created_by)
    values
      (v_title, v_sub, v_cta, v_link, v_img, coalesce(p_active, true), p_starts_at, p_ends_at,
       coalesce((select max(b.position) from public.site_banners b where b.placement = 'vendor_dashboard'), 0) + 1,
       auth.uid())
    returning id into v_id;
  else
    update public.site_banners b
       set title = v_title, subtitle = v_sub, cta_label = v_cta, link_path = v_link,
           image_path = v_img, active = coalesce(p_active, true), starts_at = p_starts_at,
           ends_at = p_ends_at, updated_at = now()
     where b.id = p_id
    returning b.id into v_id;
    if v_id is null then
      raise exception 'That banner no longer exists.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end
$function$;

-- CREATE OR REPLACE keeps both functions' grants and owner.

-- Self-checks
do $$
begin
  if exists (select 1 from public.category_images where id like 'new-arrivals/%') then
    raise exception 'self-check: New Arrivals slots are still there';
  end if;
  if (select count(*) from public.category_images) < 179 then
    raise exception 'self-check: category slots are missing (% rows)', (select count(*) from public.category_images);
  end if;
  if pg_get_functiondef('public.admin_category_image_set(text,text)'::regprocedure) ~ 'png'
     or pg_get_functiondef('public.admin_site_banner_save(uuid,text,text,text,text,text,boolean,timestamp with time zone,timestamp with time zone)'::regprocedure) ~ 'png' then
    raise exception 'self-check: a save function still accepts png';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.admin_category_image_set(text,text)'::regprocedure) is not true then
    raise exception 'self-check: admin_category_image_set lost SECURITY DEFINER';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid in ('public.category_images'::regclass, 'public.site_banners'::regclass)
                and conname in ('category_images_image_path', 'site_banners_image_path')
                and pg_get_constraintdef(oid) ~ 'png|webp') then
    raise exception 'self-check: a path check still admits png/webp';
  end if;
end $$;
