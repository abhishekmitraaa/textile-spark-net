-- Targeted (single-vendor) quote requests.
-- vendor_id/product_id set  => direct request to one vendor, raised from a product page.
-- both null                 => existing open-marketplace RFQ, behaviour unchanged.
alter table public.rfqs
  add column if not exists vendor_id uuid null references public.vendor_profiles(id),
  add column if not exists product_id uuid null references public.products(id),
  add column if not exists colors text[] null,
  add column if not exists sizes_breakdown jsonb null,
  add column if not exists customization_requested boolean not null default false,
  add column if not exists customization_notes text null,
  add column if not exists customization_images text[] null;

comment on column public.rfqs.vendor_id is
  'Target vendor for a direct request. NULL = open marketplace RFQ (visible to all vendors).';
comment on column public.rfqs.product_id is
  'Product this request was raised from. NULL for open marketplace RFQs.';
comment on column public.rfqs.sizes_breakdown is
  'Per-size quantities, e.g. [{"size":"M","quantity":200}]. rfqs.quantity holds the sum so existing UI that reads quantity keeps working.';

-- Stage 4 reads: where vendor_id = auth.uid() and status = 'active'.
create index if not exists rfqs_vendor_id_status_idx
  on public.rfqs (vendor_id, status)
  where vendor_id is not null;

-- Open-marketplace feed reads: where vendor_id is null and status = 'active'.
create index if not exists rfqs_open_marketplace_idx
  on public.rfqs (status)
  where vendor_id is null;

create index if not exists rfqs_product_id_idx
  on public.rfqs (product_id)
  where product_id is not null;
