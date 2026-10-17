-- ─────────────────────────────────────────────────────────────────────────────
-- A listing's PDFs (spec sheets, catalogues, test reports) are really stored (2026-10-17)
--
-- Mitra: the admin approving a product should see everything the vendor provided; and, asked about the product
-- form's "Add Video" / "Add PDF" (which kept only the file names and uploaded nothing): "make them upload".
-- Videos go through Video Closeups (a product_videos row tagged to the listing: the same upload, moderation
-- and player). PDFs had nowhere to go, so:
--
--   product-files (bucket)   public read like product-images; application/pdf only, 10 MB; a vendor writes only
--                            under <their uid>/, as in product-images.
--   product_documents        one row per PDF: the listing, the path, the vendor's file name, size and order.
--                            Read like product_images (anyone for a live listing, the owner and admins always);
--                            written by the listing's owner (or an admin); at most 3 per listing.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-files', 'product-files', true, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_files_owner_insert on storage.objects;
create policy product_files_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-files' and (storage.foldername(name))[1] = (select auth.uid())::text
              and name ~ '\.pdf$' and (select public.account_not_deleted((select auth.uid()))));
drop policy if exists product_files_owner_delete on storage.objects;
create policy product_files_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists product_files_owner_select on storage.objects;
create policy product_files_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'product-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.product_documents (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  path        text not null
              constraint product_documents_path check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  name        text not null constraint product_documents_name check (char_length(name) between 1 and 120),
  size_bytes  integer constraint product_documents_size check (size_bytes is null or size_bytes between 1 and 10485760),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, path)
);
create index if not exists product_documents_product_idx on public.product_documents (product_id, position);

alter table public.product_documents enable row level security;

drop policy if exists pdocs_select on public.product_documents;
create policy pdocs_select on public.product_documents for select
  using (exists (select 1 from public.products p
                  where p.id = product_documents.product_id
                    and (p.status = 'live' or p.vendor_id = (select auth.uid()) or (select public.is_admin()))));
drop policy if exists pdocs_insert on public.product_documents;
create policy pdocs_insert on public.product_documents for insert to authenticated
  with check ((public.owns_product(product_id) and split_part(path, '/', 1) = (select auth.uid())::text)
              or (select public.is_admin()));
drop policy if exists pdocs_delete on public.product_documents;
create policy pdocs_delete on public.product_documents for delete to authenticated
  using (public.owns_product(product_id) or (select public.is_admin()));

revoke all on public.product_documents from public, anon, authenticated;
grant select on public.product_documents to anon, authenticated;
grant insert (product_id, path, name, size_bytes, position), delete on public.product_documents to authenticated;

-- At most 3 PDFs per listing (the form's limit, held here too).
create or replace function public.product_documents_cap()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if (select count(*) from public.product_documents d where d.product_id = new.product_id) >= 3 then
    raise exception 'A listing can have at most 3 PDFs.' using errcode = '23514';
  end if;
  return new;
end
$function$;
drop trigger if exists trg_product_documents_cap on public.product_documents;
create trigger trg_product_documents_cap before insert on public.product_documents
  for each row execute function public.product_documents_cap();

-- Self-checks
do $$
begin
  if (select allowed_mime_types from storage.buckets where id = 'product-files') <> array['application/pdf'] then
    raise exception 'self-check: product-files takes something other than PDFs';
  end if;
  if has_table_privilege('anon', 'public.product_documents', 'insert')
     or has_table_privilege('authenticated', 'public.product_documents', 'update') then
    raise exception 'self-check: product_documents grants are too wide';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.product_documents'::regclass) then
    raise exception 'self-check: RLS is off on product_documents';
  end if;
end $$;
