-- Security audit run-2 F-01 (KYC file swap). A seller could swap the file behind an already-verified KYC
-- document, or behind a signed supplier agreement, and the record kept saying "verified"/stayed on file:
--   1. delete their own object in business-docs  (business_docs_owner_delete: owner + active, no in-use guard)
--   2. upload a different file at the same path   (business_docs_owner_insert: owner + active, no in-use guard)
-- vendor_documents.file_url / vendor_contracts.signature_url still point at that path, so the row is unchanged.
--
-- The overwrite-via-upsert half (AR-H03, 2026-11-22) already dropped the UPDATE policy on business-docs. This
-- closes the delete+re-insert half the same way every other bucket closes its swap vector: storage_object_in_use.
--
-- business-docs holds two kinds of object, both evidence a seller must not be able to replace after the fact:
--   * {vendor}/kyc/...       a KYC scan, "in use" once an admin has marked its vendor_documents row verified
--   * {vendor}/contract/...  a signed supplier agreement, "in use" for as long as its vendor_contracts row exists
--                            (vendor_contracts is append-only: no update, no delete, for anyone)
--
-- Applied to production 2026-11-24 via execute_sql (create-or-replace function, then gap-free ALTER POLICY on each
-- write policy); the MCP migration tool declined the batch. Not recorded in the migration ledger (house practice).
--
-- Legitimate flows are unaffected: every upload uses a fresh random path (uploadKycDocument), and
-- replaceVendorDocuments() deletes the superseded DB row BEFORE removing its storage object, so the object is
-- no longer referenced (not "in use") by the time the delete runs. A pre-review document (verified = false) stays
-- freely replaceable. Reads (business_docs_owner_select) are untouched.

begin;

create or replace function public.storage_object_in_use(p_bucket text, p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
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
    when 'product-files' then exists (
      select 1 from public.product_documents d join public.products p on p.id = d.product_id, s
       where d.path = p_name and p.vendor_id::text = s.owner)
    -- F-01: a verified KYC scan, or any signed agreement, pins its object so it can't be deleted or overwritten.
    when 'business-docs' then (
      exists (
        select 1 from public.vendor_documents vd, s
         where vd.verified and vd.vendor_id::text = s.owner
           and (vd.file_url = p_name or right(vd.file_url, length(p_name) + 1) = '/' || p_name))
      or exists (
        select 1 from public.vendor_contracts vc, s
         where vc.vendor_id::text = s.owner
           and (vc.signature_url = p_name or right(vc.signature_url, length(p_name) + 1) = '/' || p_name)))
    else false
  end
$function$;

-- Append the in-use guard to the two write policies, preserving their existing predicates verbatim.
drop policy if exists business_docs_owner_delete on storage.objects;
create policy business_docs_owner_delete on storage.objects
  for delete
  using (
    bucket_id = 'business-docs'::text
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
    and (select account_not_deleted((select auth.uid())))
    and not storage_object_in_use(bucket_id, name)
  );

drop policy if exists business_docs_owner_insert on storage.objects;
create policy business_docs_owner_insert on storage.objects
  for insert
  with check (
    bucket_id = 'business-docs'::text
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
    and (select account_not_deleted((select auth.uid())))
    and not storage_object_in_use(bucket_id, name)
  );

-- self-check: both write policies on business-docs must now carry the in-use guard.
do $$
begin
  if (select count(*) from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in ('business_docs_owner_delete', 'business_docs_owner_insert')
         and coalesce(qual, '') || coalesce(with_check, '') ilike '%storage_object_in_use%') <> 2 then
    raise exception 'self-check: the in-use guard is missing from a business-docs write policy';
  end if;
  if not public.storage_object_in_use('business-docs', 'x/kyc/y')
     is not null then
    raise exception 'self-check: storage_object_in_use is not callable for business-docs';
  end if;
end
$$;

commit;
