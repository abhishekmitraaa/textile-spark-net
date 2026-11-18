-- Card thumbnails made by the server (Mitra, 2026-11-18: "Build server-made"; buyer review H-12).
--
-- Product cards downloaded each listing's full photo (up to 1,600 px). They now ask for a 480 px JPEG thumbnail first
-- (src/lib/thumbs.ts) and fall back to the full photo. Thumbnails are made by the edge function `product-thumbs` from
-- the approved photo, never by the seller's browser: a seller-made thumbnail is a second file the seller controls,
-- shown on cards while review sees only the full photo.
--
--   * Bucket `product-thumbs`: public (cards read it like product-images), JPEG only, 512 KB. No storage policy admits
--     a browser role to write it (checked below), so only the service role does.
--   * admin.queue_product_thumbs(product): one pg_net request per photo of a live listing (the function decodes one
--     photo per request: an edge function has ~2 s of CPU), with the Vault service_role key, as
--     site_config_queue_snapshot() does. It never fails the caller's write.
--   * trg_products_thumbs: a listing going live queues its photos. Changing a live listing's photos sends it back to
--     review, so the next approval queues the new ones.
--   * Existing live listings: run `select admin.queue_product_thumbs(id) from public.products where status = 'live';`
--     once the function is deployed (release step; this migration does not, so nothing is sent to a function that
--     isn't there yet).

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-thumbs', 'product-thumbs', true, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];

create or replace function admin.queue_product_thumbs(p_product_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key    text;
  v_path   text;
  v_queued integer := 0;
begin
  if not exists (select 1 from public.products p where p.id = p_product_id and p.status = 'live') then
    return 0;
  end if;
  select s.decrypted_secret into v_key from vault.decrypted_secrets s where s.name = 'service_role_key';
  if v_key is null then
    raise warning 'product thumbnails not queued: Vault secret service_role_key is missing';
    return 0;
  end if;
  for v_path in
    select substring(i.url from '/storage/v1/object/public/product-images/(.+)$')
      from public.product_images i
     where i.product_id = p_product_id
       and i.url ~ '/storage/v1/object/public/product-images/.+\.(jpe?g|png)$'
  loop
    perform net.http_post(
      url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/product-thumbs',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('path', v_path),
      timeout_milliseconds := 30000
    );
    v_queued := v_queued + 1;
  end loop;
  return v_queued;
end
$function$;
revoke all on function admin.queue_product_thumbs(uuid) from public, anon, authenticated;

create or replace function admin.trg_products_thumbs()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  begin
    perform admin.queue_product_thumbs(new.id);
  exception when others then
    -- Never fail a moderator's approval over a thumbnail: the card shows the full photo meanwhile.
    raise warning 'product thumbnails not queued for %: %', new.id, sqlerrm;
  end;
  return null;
end
$function$;
revoke all on function admin.trg_products_thumbs() from public, anon, authenticated;

drop trigger if exists trg_products_thumbs on public.products;
create trigger trg_products_thumbs
  after update of status on public.products
  for each row
  when (new.status = 'live' and old.status is distinct from new.status)
  execute function admin.trg_products_thumbs();

-- Self-check: the bucket is JPEG-only and public, and no storage policy lets a browser role write to it — neither one
-- that names no bucket, one written as "every bucket but …", nor one naming this bucket.
do $check$
declare n integer;
begin
  if not exists (select 1 from storage.buckets where id = 'product-thumbs' and public
                   and allowed_mime_types = array['image/jpeg']) then
    raise exception 'product_thumbs self-check: bucket product-thumbs is not public JPEG-only';
  end if;
  select count(*) into n
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and (   (coalesce(qual, '') !~ 'bucket_id' and coalesce(with_check, '') !~ 'bucket_id')
          or (coalesce(qual, '') || coalesce(with_check, '')) ~* 'bucket_id\s*(<>|!=)|not in'
          or (coalesce(qual, '') || coalesce(with_check, '')) ~ 'product-thumbs');
  if n <> 0 then
    raise exception 'product_thumbs self-check: % storage write policies could reach product-thumbs', n;
  end if;
end
$check$;

commit;
