-- Seller registration collects the documents the Seller Registration FAQ lists
-- (Andy, 2026-10-01/02): "GST Certificate, PAN card, Business registration (or
-- MSME/Udyam), Aadhar card, Product catalog (PDF, Excel, or images)". A seller can
-- add their first product instead of a catalogue (Andy, 2026-10-02).
--
--   vendor_documents.doc_type   gains business_registration and catalog
--   vendor_documents.detail     what goes with a file:
--     business_registration  {"kind": udyam | incorporation | shop_establishment | partnership | other,
--                             "number": "UDYAM-GJ-01-0000001"}   (number optional for the last three)
--     aadhaar                {"masked": true, "consent_at": "<timestamptz>"}
--                            A MASKED Aadhaar only: the first 8 digits hidden, as UIDAI's
--                            masked Aadhaar shows it. The number itself is never asked for
--                            or stored. Counsel to confirm before launch (ToDo.md).
--     catalog                {"name": "<file name>", "mime": "<type>"}  one row per file
--
-- Nothing else changes: the rows are still written by the seller under the existing
-- vendor_documents_insert policy (Phase 12, 20261002072403), still forced unreviewed by
-- vendor_documents_guard_review_columns(), and still reviewed through
-- set_vendor_document_verified(). Grants are table-wide, so the new column needs none.

alter table public.vendor_documents
  add column if not exists detail jsonb not null default '{}'::jsonb;

alter table public.vendor_documents drop constraint if exists vendor_documents_doc_type_check;
alter table public.vendor_documents add constraint vendor_documents_doc_type_check
  check (doc_type = any (array['pan', 'gst', 'cin', 'aadhaar', 'business_image', 'business_registration', 'catalog']));

alter table public.vendor_documents drop constraint if exists vendor_documents_detail_check;
alter table public.vendor_documents add constraint vendor_documents_detail_check
  -- coalesce: a CHECK whose expression is NULL passes, so a missing key must read as ''.
  check (
    jsonb_typeof(detail) = 'object'
    and (doc_type <> 'business_registration'
         or coalesce(detail ->> 'kind', '') in ('udyam', 'incorporation', 'shop_establishment', 'partnership', 'other'))
    and (doc_type <> 'aadhaar' or coalesce(detail ->> 'masked', '') = 'true')
    and (doc_type not in ('business_registration', 'aadhaar', 'catalog') or file_url is not null)
  );

comment on column public.vendor_documents.detail is
  'What goes with the file: a business registration''s kind and number, a masked Aadhaar''s consent, a catalogue file''s name and type. Never an Aadhaar number.';

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.vendor_documents'::regclass
                  and attname = 'detail' and not attisdropped) then
    raise exception 'vendor_documents.detail is missing';
  end if;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'vendor_documents_doc_type_check'
                            and conrelid = 'public.vendor_documents'::regclass)) not like '%catalog%' then
    raise exception 'vendor_documents_doc_type_check does not allow catalog';
  end if;
  if not has_table_privilege('authenticated', 'public.vendor_documents', 'INSERT') then
    raise exception 'sellers must still be able to insert their own documents';
  end if;
end
$check$;
