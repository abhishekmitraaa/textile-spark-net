-- Follow-up to 20261124130000_business_docs_no_swap.sql (security audit run-2 F-01), from the automated review of that
-- file (2026-11-24, securityflags.md). Two gaps in the F-01 fix, both confirmed on production:
--
--   1. The business-docs pin required vd.verified, so between an admin opening a document and verifying it the seller
--      could delete the object and upload a different file at the same path: the admin verified a file they never
--      saw. Now any vendor_documents row that names an object pins it, verified or not. Legitimate flows are
--      unaffected: every upload takes a fresh random path (uploadKycDocument), a refused submission removes files no
--      row names, and replaceVendorDocuments() deletes the superseded rows BEFORE removing their objects.
--
--   2. vendor_documents_delete let a seller delete a verified row, which unpinned its object, so an approved seller
--      could destroy the KYC evidence they were approved on. Now a browser may delete a verified row only once a newer
--      row of the same document type exists: that is replaceVendorDocuments() superseding it (insert the new rows
--      first, then delete the old), which also sends the document back to review. Deleting it outright is refused.
--      Jobs, migrations and the service role are not affected (admin.trusted_caller()).
--
-- storage_object_in_use() is otherwise production's body verbatim (compared 2026-11-24; only a comment differed).

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
    -- F-01: any KYC document (in review or verified) and any signed agreement pins its object.
    when 'business-docs' then (
      exists (
        select 1 from public.vendor_documents vd, s
         where vd.vendor_id::text = s.owner
           and (vd.file_url = p_name or right(vd.file_url, length(p_name) + 1) = '/' || p_name))
      or exists (
        select 1 from public.vendor_contracts vc, s
         where vc.vendor_id::text = s.owner
           and (vc.signature_url = p_name or right(vc.signature_url, length(p_name) + 1) = '/' || p_name)))
    else false
  end
$function$;

-- A browser deletes a verified KYC row only when a newer row of the same type supersedes it.
-- SECURITY DEFINER: the caller (a seller's browser) can't reach the admin schema that trusted_caller() lives in; the
-- rehearsal without it refused every seller's delete, the legitimate resubmission too.
create or replace function public.vendor_documents_guard_verified_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if old.verified and not admin.trusted_caller() and not exists (
       select 1 from public.vendor_documents n
        where n.vendor_id = old.vendor_id and n.doc_type = old.doc_type
          and n.id <> old.id and n.created_at >= old.created_at) then
    raise exception 'A verified document can only be replaced with a new one, not deleted.'
      using errcode = '42501', hint = 'verified_document';
  end if;
  return old;
end
$function$;

revoke all on function public.vendor_documents_guard_verified_delete() from public, anon, authenticated;

drop trigger if exists vendor_documents_guard_verified_delete on public.vendor_documents;
create trigger vendor_documents_guard_verified_delete
  before delete on public.vendor_documents
  for each row execute function public.vendor_documents_guard_verified_delete();

-- Self-check.
do $check$
begin
  if position('vd.verified' in pg_get_functiondef('public.storage_object_in_use(text,text)'::regprocedure)) > 0 then
    raise exception 'self-check: business-docs still pins verified documents only';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'vendor_documents_guard_verified_delete'
                  and tgrelid = 'public.vendor_documents'::regclass and not tgisinternal) then
    raise exception 'self-check: the verified-delete guard is missing';
  end if;
end
$check$;

commit;
