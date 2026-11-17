-- Reference images on a request sent to one seller are private (2026-10-13 code review item 3; brought to production
-- 2026-11-18, decided by Claude as the obvious fix: a tech pack or an unreleased design is what a buyer attaches here,
-- and only that buyer, that seller and Cosora staff need it). This was 20261013100200 on branch fix/review-2026-10-13,
-- a number another file has since taken; it is unchanged below. Requirement photos (rfqs.images, open to every seller
-- by design, 2026-10-14) are not affected.

-- Reference images on a quote request were public (code review 2026-10-13).
--
-- A buyer's customization images went to the public `product-images` bucket and the rfq
-- stored their public URLs. The rfq row itself is readable only by its buyer, the vendor
-- it is addressed to and admins (rfqs_select), but the files were readable by anyone with
-- the URL, for ever, including after the request was closed or removed. A tech pack or an
-- unreleased design is exactly what a buyer attaches here.
--
-- Now they live in a private bucket, `rfq-attachments`:
--   * the buyer writes under their own folder (<uid>/rfq/<batch>/<n>.<ext>), images only,
--     10 MB each;
--   * a file is readable by its owner, and by whoever can read an rfq that lists it. The
--     second half asks public.rfqs as the caller, so rfqs_select decides: the addressed
--     vendor and admins while the row is visible to them, nobody else;
--   * rfqs.customization_images holds the object path, not a URL. The app asks for a
--     short-lived signed URL when it shows the image.
--
-- A buyer could otherwise list another account's object on their own request and let a
-- vendor account they control read it, so a signed-in account may only list paths under
-- the buyer's own folder.
--
-- No rows to move: production has no rfq with customization_images today.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rfq-attachments', 'rfq-attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create index if not exists rfqs_customization_images_idx
  on public.rfqs using gin (customization_images)
  where customization_images is not null;

-- Whether the caller may read one object: their own, or one listed on an rfq they can read.
-- SECURITY INVOKER on purpose, so the rfqs lookup runs under the caller's rfqs_select.
create or replace function public.rfq_attachment_read_allowed(p_name text)
returns boolean
language sql
stable
set search_path to ''
as $function$
  select coalesce((storage.foldername(p_name))[1] = (select auth.uid())::text, false)
      or exists (
           select 1 from public.rfqs r
            where r.customization_images @> array[p_name]
         );
$function$;

revoke execute on function public.rfq_attachment_read_allowed(text) from public, anon;
grant execute on function public.rfq_attachment_read_allowed(text) to authenticated, service_role;

-- Created only when missing, so the file can be run again (and carries no DROP).
do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'rfq_attachments_insert') then
    create policy rfq_attachments_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'rfq-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
        and (select public.account_not_deleted((select auth.uid())))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'rfq_attachments_read') then
    create policy rfq_attachments_read on storage.objects
      for select to authenticated
      using (
        bucket_id = 'rfq-attachments'
        and (select public.rfq_attachment_read_allowed(objects.name))
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'rfq_attachments_owner_delete') then
    create policy rfq_attachments_owner_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'rfq-attachments'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end
$policies$;

-- A signed-in account lists only its own uploads on a request.
create or replace function public.guard_rfq_attachment_paths()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  p text;
begin
  if current_user <> 'authenticated' or new.customization_images is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.customization_images is not distinct from old.customization_images then
    return new;
  end if;
  foreach p in array new.customization_images loop
    if p is null or position(new.buyer_id::text || '/rfq/' in p) <> 1 or p like '%..%' then
      raise exception 'A request can only list images its buyer uploaded'
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$function$;

create or replace trigger trg_rfq_attachment_paths
  before insert or update on public.rfqs
  for each row execute function public.guard_rfq_attachment_paths();

do $check$
begin
  if (select public from storage.buckets where id = 'rfq-attachments') is distinct from false then
    raise exception 'self-check: rfq-attachments is not a private bucket';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_rfq_attachment_paths') then
    raise exception 'self-check: the path guard is missing';
  end if;
end
$check$;
