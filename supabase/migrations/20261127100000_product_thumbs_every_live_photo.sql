-- Thumbnails for every live listing photo (speed plan 2.1, 2026-11-27; documentation/speed-build-plan-2026-11-27.md §3.2).
--
-- On 2026-11-27 production had 284 live listing photos (JPEG/PNG in this project's Storage) and 4 thumbnails. Cards
-- ask for the thumbnail first, wait 1.2–1.7 s for its 400, then download the full photo (avg 168 KB, up to 2.5 MB).
-- trg_products_thumbs fires only when a listing CHANGES to live, so these never queued one:
--   * a listing inserted as live (the 280 sample listings, 2026-11-24);
--   * a photo inserted, or its address changed, on a listing that is already live (photos are inserted after their
--     listing row, so even a listing approved later has its photos only if they were there at approval).
-- This adds the two missing triggers. Each queues only the photo it is about (one pg_net request), through the same
-- checks as admin.queue_product_thumbs(): live listing, this project's own Storage address, JPEG or PNG.
--
-- Existing photos are NOT queued here (that is a one-off backfill, scripts/perf/thumbs-backfill.sql, D-6 in the plan:
-- run only with Mitra's go-ahead, in batches, after this is applied).

begin;

create or replace function admin.queue_product_thumb_url(p_product_id uuid, p_url text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key  text;
  v_path text;
begin
  if p_url is null
     or p_url !~ '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/[^?#]+\.(jpe?g|png)$' then
    return 0;
  end if;
  if not exists (select 1 from public.products p where p.id = p_product_id and p.status = 'live') then
    return 0;
  end if;
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'service_role_key';
  if v_key is null then
    raise warning 'product thumbnail not queued: Vault secret service_role_key is missing';
    return 0;
  end if;
  v_path := substring(p_url from '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/(.+)$');
  perform net.http_post(
    url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/product-thumbs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('path', v_path),
    timeout_milliseconds := 30000
  );
  return 1;
end
$function$;
revoke all on function admin.queue_product_thumb_url(uuid, text) from public, anon, authenticated;

-- A photo added to, or changed on, a live listing.
create or replace function admin.trg_product_images_thumbs()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    perform admin.queue_product_thumb_url(new.product_id, new.url);
  exception when others then
    -- Never fail the photo write over a thumbnail: the card shows the full photo meanwhile.
    raise warning 'product thumbnail not queued for %: %', new.product_id, sqlerrm;
  end;
  return null;
end
$function$;
revoke all on function admin.trg_product_images_thumbs() from public, anon, authenticated;

drop trigger if exists trg_product_images_thumbs on public.product_images;
create trigger trg_product_images_thumbs
  after insert or update of url on public.product_images
  for each row
  when (new.url is not null)
  execute function admin.trg_product_images_thumbs();

-- A listing inserted as live (its photos, if inserted later, are queued by the trigger above).
drop trigger if exists trg_products_thumbs_insert on public.products;
create trigger trg_products_thumbs_insert
  after insert on public.products
  for each row
  when (new.status = 'live')
  execute function admin.trg_products_thumbs();

do $check$
begin
  if position('^https://vxdhhgdfubqedfpwfyrb' in (select prosrc from pg_proc where oid = 'admin.queue_product_thumb_url(uuid, text)'::regprocedure)) = 0 then
    raise exception 'product_thumbs_every_live_photo self-check: the queue is not anchored to this project''s host';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_product_images_thumbs' and tgrelid = 'public.product_images'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'trg_products_thumbs_insert' and tgrelid = 'public.products'::regclass) then
    raise exception 'product_thumbs_every_live_photo self-check: a trigger is missing';
  end if;
  if has_function_privilege('authenticated', 'admin.queue_product_thumb_url(uuid, text)', 'execute')
     or has_function_privilege('anon', 'admin.queue_product_thumb_url(uuid, text)', 'execute') then
    raise exception 'product_thumbs_every_live_photo self-check: a browser role can queue thumbnails';
  end if;
end
$check$;

commit;
