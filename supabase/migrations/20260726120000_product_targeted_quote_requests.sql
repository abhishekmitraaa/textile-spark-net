-- Product-Targeted Quotation Requests — Stage 0
--
-- Adds a second RFQ shape: a request aimed at ONE vendor about ONE product,
-- alongside the existing open-marketplace RFQ. No new table — `rfqs` gains
-- nullable targeting columns, and the discriminator is `vendor_id`:
--
--   vendor_id IS NULL      -> open marketplace RFQ (existing behaviour, untouched)
--   vendor_id IS NOT NULL  -> direct request, visible only to that vendor
--
-- `quantity` is deliberately retained and must be populated with the SUM of
-- sizes_breakdown, so every existing reader (lead cards, My Quotes stats) keeps
-- working with no code change.

-- ── products: real per-listing sizes + customization availability ───────────
-- Both are new vendor-set listing fields. `customization_available` replaces a
-- hardcoded frontend constant that was never tied to a product row.
alter table public.products
  add column if not exists sizes text[] null,
  add column if not exists customization_available boolean not null default false;

comment on column public.products.sizes is
  'Vendor-selected available sizes for this listing. NULL/empty = unspecified.';
comment on column public.products.customization_available is
  'Vendor opt-in: buyers may attach a customization request to a quote request.';

-- ── rfqs: targeting + the product-scoped request payload ───────────────────
alter table public.rfqs
  add column if not exists vendor_id uuid null references public.vendor_profiles(id),
  add column if not exists product_id uuid null references public.products(id),
  add column if not exists colors text[] null,
  add column if not exists sizes_breakdown jsonb null,
  add column if not exists customization_requested boolean not null default false,
  add column if not exists customization_notes text null,
  add column if not exists customization_images text[] null;

comment on column public.rfqs.vendor_id is
  'Target vendor for a direct request. NULL = open marketplace RFQ. Also the RLS discriminator.';
comment on column public.rfqs.product_id is
  'Product this request originated from. NULL for open marketplace RFQs.';
comment on column public.rfqs.sizes_breakdown is
  'e.g. [{"size":"M","quantity":200},{"size":"L","quantity":150}]. rfqs.quantity must equal the sum.';
comment on column public.rfqs.customization_images is
  'Storage object paths (NOT base64, NOT data URLs).';

-- Serves the vendor inbox query (vendor_id = auth.uid() and status = 'active').
-- Partial: open-marketplace rows are the large majority and are never selected
-- by vendor_id, so they are excluded from the index entirely.
create index if not exists rfqs_vendor_active_idx
  on public.rfqs (vendor_id, created_at desc)
  where vendor_id is not null;

create index if not exists rfqs_product_idx
  on public.rfqs (product_id)
  where product_id is not null;

-- ── messages: link a chat message back to the RFQ / quote it describes ─────
-- `kind` is already free-text (not an enum), so the new 'quote_request' /
-- 'quote_reply' values need no migration — they are introduced by app code.
alter table public.messages
  add column if not exists rfq_id uuid null references public.rfqs(id),
  add column if not exists quote_id uuid null references public.quotes(id);

-- ── RLS: stop leaking targeted RFQs ────────────────────────────────────────
-- The existing policy is
--     (status = 'active') OR (buyer_id = auth.uid()) OR is_admin()
-- so any active RFQ is readable by everyone. Verified live 2026-07-26: the
-- anon key alone returns active rfqs rows WITHOUT a signed-in user, so the
-- exposure is public, not merely authenticated-wide. Harmless while nothing is
-- targeted; a direct leak the moment a request carries a vendor_id.
--
-- New rule: an active row is public only while it is untargeted. A targeted row
-- is readable by its target vendor and (via the buyer_id arm) its author.
-- vendor_profiles.id is the auth user id, so vendor_id = auth.uid() is correct.
drop policy if exists rfqs_select on public.rfqs;

create policy rfqs_select on public.rfqs
  for select
  using (
    (status = 'active' and (vendor_id is null or vendor_id = auth.uid()))
    or buyer_id = auth.uid()
    or is_admin()
  );

-- rfqs_insert / quotes_* are already scoped to buyer_id = auth.uid() and
-- vendor_id = auth.uid() respectively, which covers the targeted case. Unchanged.
