-- The 2026-11-18 buyer review's leftovers (2026-11-20): H-12's follow-ups, M-75's remaining foreign-key indexes, and the
-- visitor write grants found while releasing Low batch 5.
--
-- Deploy the edge function `product-thumbs` (its `remove` action) BEFORE applying this: the last block asks it to
-- delete four superseded thumbnails, and the triggers below call it from then on.
--
-- Mitra (2026-11-20, H-12 follow-up): "Remove on delete only". A listing taken down (or otherwise no longer live, other
-- than paused) loses its thumbnails, which come back when it goes live again (trg_products_thumbs); a deleted listing
-- loses its photos and thumbnails, unless something else still shows the photo.

begin;

-- ── H-12 (1): photos and thumbnails follow the listing ─────────────────────────────────────────────────────────────
-- Is a product-images path still shown anywhere? Every column that can hold a product-images address, by its tail.
create or replace function public.product_photo_in_use(p_path text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  with s as (select '/storage/v1/object/public/product-images/' || p_path as tail)
  select exists (select 1 from public.product_images i, s where right(i.url, length(s.tail)) = s.tail)
      or exists (select 1 from public.advertisements a, s where right(a.image_url, length(s.tail)) = s.tail)
      or exists (select 1 from public.catalogues c, s where right(c.cover_url, length(s.tail)) = s.tail)
      or exists (select 1 from public.product_videos v, s where right(v.thumbnail_url, length(s.tail)) = s.tail)
      or exists (select 1 from public.product_reviews r, s, unnest(r.photos) u where right(u, length(s.tail)) = s.tail)
      or exists (select 1 from public.rfqs r, s where right(r.image, length(s.tail)) = s.tail)
      or exists (select 1 from public.rfqs r, s, unnest(r.images) u where right(u, length(s.tail)) = s.tail)
      or exists (select 1 from public.rfq_submissions r, s where right(r.image, length(s.tail)) = s.tail)
      or exists (select 1 from public.rfq_submissions r, s, unnest(r.images) u where right(u, length(s.tail)) = s.tail)
      or exists (select 1 from public.vendor_premises_photos p, s where right(p.url, length(s.tail)) = s.tail)
      or exists (select 1 from public.vendor_profiles v, s
                  where right(v.logo_url, length(s.tail)) = s.tail or right(v.banner_url, length(s.tail)) = s.tail)
      or exists (select 1 from public.vendor_profiles v, s, unnest(v.office_photos) u where right(u, length(s.tail)) = s.tail)
      or exists (select 1 from public.profiles p, s where right(p.avatar_url, length(s.tail)) = s.tail)
$function$;
revoke all on function public.product_photo_in_use(text) from public, anon, authenticated;
grant execute on function public.product_photo_in_use(text) to service_role;

-- A listing's photo paths in this project's Storage (the shape admin.queue_product_thumbs() reads).
create or replace function admin.product_photo_paths(p_product_id uuid)
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(array_agg(substring(i.url from '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/(.+)$')), '{}')
    from public.product_images i
   where i.product_id = p_product_id
     and i.url ~ '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/[^?#]+\.(jpe?g|png)$'
$function$;
revoke all on function admin.product_photo_paths(uuid) from public, anon, authenticated;

-- Asks product-thumbs to remove thumbnails / originals. pg_net sends after the write commits; a rolled-back write sends
-- nothing. The function checks each path again (thumbs: not a live photo; originals: product_photo_in_use()).
create or replace function admin.queue_product_photo_removal(p_thumbs text[], p_originals text[], p_legacy text[] default '{}')
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_key text;
begin
  if coalesce(cardinality(p_thumbs), 0) + coalesce(cardinality(p_originals), 0) + coalesce(cardinality(p_legacy), 0) = 0 then
    return false;
  end if;
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'service_role_key';
  if v_key is null then
    raise warning 'product photo removal not queued: Vault secret service_role_key is missing';
    return false;
  end if;
  perform net.http_post(
    url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/product-thumbs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('remove', jsonb_build_object(
                 'thumbs', to_jsonb(coalesce(p_thumbs, '{}')),
                 'originals', to_jsonb(coalesce(p_originals, '{}')),
                 'legacy', to_jsonb(coalesce(p_legacy, '{}')))),
    timeout_milliseconds := 30000
  );
  return true;
end
$function$;
revoke all on function admin.queue_product_photo_removal(text[], text[], text[]) from public, anon, authenticated;

-- Leaving live (but not for a pause: a paused listing comes back as it was) drops the thumbnails; deleting the listing
-- drops its photos. Never fails the write that fires it.
create or replace function admin.trg_products_photos_follow()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  begin
    if tg_op = 'DELETE' then
      perform admin.queue_product_photo_removal('{}', admin.product_photo_paths(old.id));
      return old;
    end if;
    perform admin.queue_product_photo_removal(admin.product_photo_paths(new.id), '{}');
  exception when others then
    raise warning 'product photo removal not queued for %: %', coalesce(new.id, old.id), sqlerrm;
  end;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;
revoke all on function admin.trg_products_photos_follow() from public, anon, authenticated;

drop trigger if exists trg_products_thumbs_off on public.products;
create trigger trg_products_thumbs_off
  after update of status on public.products
  for each row
  when (old.status = 'live' and new.status is distinct from 'live' and new.status is distinct from 'paused')
  execute function admin.trg_products_photos_follow();

-- BEFORE: the listing's photo rows go with it (cascade), so they are read first.
drop trigger if exists trg_products_photos_on_delete on public.products;
create trigger trg_products_photos_on_delete
  before delete on public.products
  for each row
  execute function admin.trg_products_photos_follow();

-- ── M-75 follow-up: every foreign key has an index ─────────────────────────────────────────────────────────────────
-- 60 had none on production (most on small tables; the ones that matter: deleting a listing or a video scanned
-- recently_viewed, saved_items, saved_folder_items, saved_videos, video_likes, advertisements, product_videos).
do $fk$
declare
  r record;
  v_name text;
begin
  for r in
    select c.conrelid, n.nspname, t.relname, c.conkey,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
           (select string_agg(a.attname, '_' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as colnames
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and n.nspname in ('public', 'admin') and t.relkind = 'r'
       and not exists (select 1 from pg_index i
                        where i.indrelid = c.conrelid
                          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey::int2[])
  loop
    v_name := left(r.relname || '_' || r.colnames, 55) || '_fk_idx';
    execute format('create index if not exists %I on %I.%I (%s)', v_name, r.nspname, r.relname, r.cols);
  end loop;
end
$fk$;

-- ── M-33 follow-up: an ad's engagement event rides in the impression batch ────────────────────────────────────────
-- The page sent ad_impressions() once for the ads it showed, but still one log_engagement_event() per ad. Now the batch
-- records each ad's event too (the same function, so its limits and dedupe apply as before), and the app stops sending
-- them one by one. An event that fails never fails the impressions.
create or replace function public.ad_impressions(p_ads uuid[], p_session text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ad uuid;
begin
  if p_ads is null or cardinality(p_ads) = 0 then return; end if;
  if cardinality(p_ads) > 48 then
    raise exception 'Too many ads in one call' using errcode = '22023';
  end if;
  -- The same rule as ad_impression(): every view of a running campaign is queued, no cap (Mitra, 2026-11-18).
  -- Each campaign once per call, as one ad_impression() call each (code review: 48 copies of one id in a call).
  insert into admin.ad_impression_queue (ad_id)
  select a.id from public.advertisements a
   where a.id in (select distinct x.id from unnest(p_ads) as x(id))
     and a.status = 'active';
  for v_ad in select distinct x.id from unnest(p_ads) as x(id) where x.id is not null loop
    begin
      perform public.log_engagement_event('ad_impression', null, null, v_ad, p_session, 'ad', null, null);
    exception when others then
      null; -- telemetry is never load-bearing (the app's logEngagement() swallowed these too)
    end;
  end loop;
end
$function$;
revoke all on function public.ad_impressions(uuid[], text) from public;
grant execute on function public.ad_impressions(uuid[], text) to anon, authenticated;

-- ── Visitors can't write tables ────────────────────────────────────────────────────────────────────────────────────
-- anon held Supabase's default INSERT/UPDATE/DELETE on 33 public tables (and column grants on profiles, account_status
-- included). Every write policy a visitor reaches needs a signed-in id or an admin role, and every public table has row
-- security on (both checked on production 2026-11-20), so nothing could be written: this takes the grants away too.
-- Visitors still call the functions meant for them (views, searches, engagement events), which run as their owner.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon;

-- ── H-12 (2): the four thumbnails named before the <path>.jpg naming ───────────────────────────────────────────────
select admin.queue_product_photo_removal('{}', '{}', array[
  'cf75f304-4d3f-4388-9b06-c1caa485a258/onboarding-product/1790695984199-c5oyz2.jpg',
  'cf75f304-4d3f-4388-9b06-c1caa485a258/onboarding-product/1790695984200-jc88x9.jpg',
  'cf75f304-4d3f-4388-9b06-c1caa485a258/onboarding-product/1790695984200-pcoc9v.jpg',
  'cf75f304-4d3f-4388-9b06-c1caa485a258/onboarding-product/1790695984200-vj7p9x.jpg']);

-- ── Self-check ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $check$
declare v_left integer;
begin
  select count(*) into v_left
    from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
   where c.contype = 'f' and n.nspname in ('public', 'admin') and t.relkind = 'r'
     and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                      and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey::int2[]);
  if v_left > 0 then
    raise exception 'review_leftovers: % foreign keys without an index', v_left;
  end if;
  if exists (select 1 from information_schema.table_privileges
              where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'review_leftovers: anon still writes a public table';
  end if;
  if exists (select 1 from information_schema.column_privileges
              where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE')) then
    raise exception 'review_leftovers: anon still holds a column write grant';
  end if;
  if has_function_privilege('authenticated', 'public.product_photo_in_use(text)', 'execute')
     or has_function_privilege('anon', 'public.product_photo_in_use(text)', 'execute') then
    raise exception 'review_leftovers: product_photo_in_use is browser-callable';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_products_photos_on_delete' and tgrelid = 'public.products'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_products_thumbs_off' and tgrelid = 'public.products'::regclass) then
    raise exception 'review_leftovers: photo triggers missing';
  end if;
end
$check$;

commit;
