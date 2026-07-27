-- Per-product available sizes and whether the vendor accepts customization.
-- Both are set by the vendor at listing time (Stage 1).
alter table public.products
  add column if not exists sizes text[] null,
  add column if not exists customization_available boolean not null default false;

comment on column public.products.sizes is
  'Vendor-selected available sizes for this listing, e.g. {S,M,L,XL}. Null = not specified.';
comment on column public.products.customization_available is
  'Whether the vendor accepts customization requests for this product.';
