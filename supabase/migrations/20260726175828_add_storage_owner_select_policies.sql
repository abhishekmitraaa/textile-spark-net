-- Supabase Storage's upload performs `INSERT ... RETURNING` on storage.objects.
-- Under RLS that also requires a SELECT policy admitting the new row; without
-- one Postgres raises 42501 "new row violates row-level security policy", which
-- misleadingly implicates the INSERT policy. These four buckets had
-- INSERT/UPDATE/DELETE policies but no SELECT, so every upload to them failed
-- (vendor product images, catalogues, product videos, avatars, and the new
-- buyer customization images). `business-docs` already had one and worked.
--
-- Scope: these buckets are public, so file serving already bypasses RLS. This
-- grants an uploader read access to their OWN object metadata row only, which
-- is what upload needs; it does not widen access to the files themselves.
-- No `or is_admin()`: nothing admin-facing reads storage.objects directly
-- (there is no admin UI yet, and product images are read via the stored
-- product_images.url public URL).

create policy avatars_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy catalogues_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'catalogues' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy product_images_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy product_videos_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-videos' and (storage.foldername(name))[1] = (auth.uid())::text);
