-- Vendor "My Store" cluster: two additive columns.
--
-- 1. products.unit — the onboarding step-7 form has always collected a unit
--    ("pieces"/"kg"/"meters"/...) and dropped it on the floor because there was
--    nowhere to put it. fetchMyProducts() hardcoded `unit: "Piece"` for every
--    product in the catalogue as a result.
--
-- 2. vendor_profiles.recommended_product_ids — the "Brand's Recommendations"
--    block on /business-profile is a CURATED SUBSET of the vendor's live
--    products in a vendor-chosen order. It is storefront presentation, not a
--    property of a product, so it belongs on the profile rather than as a
--    products.display_order column: a global ordering could not express
--    "these four, in this order" without also implying something about the
--    other 200 products.
alter table public.products
  add column if not exists unit text;

comment on column public.products.unit is
  'Selling unit for price_value (pieces, kg, meters, sets, pairs). Collected at onboarding and on the product form.';

alter table public.vendor_profiles
  add column if not exists recommended_product_ids uuid[] not null default '{}';

comment on column public.vendor_profiles.recommended_product_ids is
  'Ordered, curated subset of this vendor''s live products featured in the "Brand''s Recommendations" block. Order is meaningful. Ids are not FK-enforced: a deleted/unpublished product is filtered out on read rather than cascading a storefront edit.';
