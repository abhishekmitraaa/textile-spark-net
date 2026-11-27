-- One-off: thumbnails for the live listing photos that don't have one (speed plan 2.1, decision D-6).
-- Run ONLY with Mitra's go-ahead, after 20261127100000_product_thumbs_every_live_photo.sql is applied and the
-- `product-thumbs` function is deployed. Each run queues at most 20 photos (the function takes ~2 s of CPU per photo);
-- run it once a minute until it returns 0. Safe to repeat: a photo that has its thumbnail is skipped.
--
-- Progress: the last select below (photos still without a thumbnail).

select count(*) filter (where admin.queue_product_thumb_url(i.product_id, i.url) = 1) as queued
  from (
    select i.product_id, i.url
      from public.product_images i
      join public.products p on p.id = i.product_id and p.status = 'live'
     where i.url ~ '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/[^?#]+\.(jpe?g|png)$'
       and not exists (
         select 1 from storage.objects o
          where o.bucket_id = 'product-thumbs'
            and o.name = substring(i.url from '/product-images/(.+)$') || '.jpg')
     order by p.created_at desc, i.position nulls last
     limit 20
  ) i;

select count(*) as still_without_thumbnail
  from public.product_images i
  join public.products p on p.id = i.product_id and p.status = 'live'
 where i.url ~ '^https://vxdhhgdfubqedfpwfyrb\.supabase\.co/storage/v1/object/public/product-images/[^?#]+\.(jpe?g|png)$'
   and not exists (select 1 from storage.objects o
                    where o.bucket_id = 'product-thumbs' and o.name = substring(i.url from '/product-images/(.+)$') || '.jpg');
