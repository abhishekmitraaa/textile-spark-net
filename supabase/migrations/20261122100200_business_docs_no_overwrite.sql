-- Cosora-Admin review 2026-11-22, AR-H03 (the storage half). A seller could overwrite the file behind a KYC document
-- or a signed agreement after Cosora had reviewed it, at the same path, so the row kept saying "verified".
-- Every upload goes to a new path (a timestamp and a random suffix), so no seller needs to overwrite anything.
--
-- APPLY ONLY AFTER the buyer app that uploads with upsert: false is live (fix/admin-review-high-2026-11-22):
-- Storage's upsert needs the update permission, and the older app asks for it on every KYC upload.

begin;

drop policy if exists business_docs_owner_update on storage.objects;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and cmd = 'UPDATE' and coalesce(qual, '') ilike '%business-docs%') then
    raise exception 'self-check: an update policy on business-docs remains';
  end if;
end
$$;

commit;
