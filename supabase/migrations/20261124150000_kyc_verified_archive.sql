-- Follow-up to 20261124140000_business_docs_pin_referenced.sql, from the automated review of that file (2026-11-24).
-- Its delete guard let a browser delete a verified vendor_documents row once a newer row of the same type existed. A
-- seller could insert a throwaway row, delete the verified one, delete the throwaway (unverified, so allowed): the
-- verified file was no longer referenced, so it could be deleted too. The KYC evidence was gone again.
--
-- Now verification evidence outlives its row: deleting a verified row (anyone, any route: replaceVendorDocuments(),
-- submit_vendor_registration(), a direct API call) first copies it to admin.vendor_documents_archive, and
-- storage_object_in_use() pins every business-docs object an archived row names. Nothing in the archive is deleted by
-- a seller: the admin schema isn't reachable from the API. The time check goes, so it can't be gamed:
-- a delete itself is allowed again, and the file it named stays. replaceVendorDocuments() removes superseded files
-- best-effort (a refused removal is logged and the submission carries on), so a replaced verified scan simply stays
-- in storage; the new row goes to review as before.
--
-- storage_object_in_use() is 20261124140000's body plus the archive arm.

begin;

create table if not exists admin.vendor_documents_archive (
  id uuid primary key,
  vendor_id uuid not null,
  doc_type text not null,
  file_url text,
  verified boolean not null,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  detail jsonb,
  archived_at timestamptz not null default now(),
  archived_by uuid,
  archived_session text not null default session_user
);
comment on table admin.vendor_documents_archive is
  'Verified KYC rows as they stood when deleted (2026-11-24, securityflags F-01 follow-up). Their files stay pinned in business-docs (storage_object_in_use). Append-only; never shown to sellers.';
create index if not exists vendor_documents_archive_vendor on admin.vendor_documents_archive (vendor_id);
alter table admin.vendor_documents_archive enable row level security;
revoke all on admin.vendor_documents_archive from public, anon, authenticated;

create or replace function public.vendor_documents_guard_verified_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- Keep the evidence: a verified row is archived before it goes, and its file stays pinned.
  if old.verified then
    insert into admin.vendor_documents_archive
      (id, vendor_id, doc_type, file_url, verified, created_at, reviewed_at, reviewed_by, detail, archived_by)
    values (old.id, old.vendor_id, old.doc_type, old.file_url, old.verified, old.created_at, old.reviewed_at,
            old.reviewed_by, old.detail, auth.uid())
    on conflict (id) do nothing;
  end if;
  return old;
end
$function$;
revoke all on function public.vendor_documents_guard_verified_delete() from public, anon, authenticated;

drop trigger if exists vendor_documents_guard_verified_delete on public.vendor_documents;
create trigger vendor_documents_guard_verified_delete
  before delete on public.vendor_documents
  for each row execute function public.vendor_documents_guard_verified_delete();

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
    -- F-01: any KYC document (in review or verified), any archived verified document, and any signed agreement pins
    -- its object.
    when 'business-docs' then (
      exists (
        select 1 from public.vendor_documents vd, s
         where vd.vendor_id::text = s.owner
           and (vd.file_url = p_name or right(vd.file_url, length(p_name) + 1) = '/' || p_name))
      or exists (
        select 1 from admin.vendor_documents_archive va, s
         where va.vendor_id::text = s.owner
           and (va.file_url = p_name or right(va.file_url, length(p_name) + 1) = '/' || p_name))
      or exists (
        select 1 from public.vendor_contracts vc, s
         where vc.vendor_id::text = s.owner
           and (vc.signature_url = p_name or right(vc.signature_url, length(p_name) + 1) = '/' || p_name)))
    else false
  end
$function$;

-- Self-check.
do $check$
begin
  if position('vendor_documents_archive' in pg_get_functiondef('public.storage_object_in_use(text,text)'::regprocedure)) = 0 then
    raise exception 'self-check: archived KYC files are not pinned';
  end if;
  if position('raise exception' in pg_get_functiondef('public.vendor_documents_guard_verified_delete()'::regprocedure)) > 0 then
    raise exception 'self-check: the delete guard still refuses (it should archive)';
  end if;
  if has_table_privilege('authenticated', 'admin.vendor_documents_archive', 'SELECT') then
    raise exception 'self-check: sellers can read the archive';
  end if;
end
$check$;

commit;
