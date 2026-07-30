-- Vendors have been asked for these attributes at listing time since the upload
-- form was built (see src/data/sellerCategories.ts), several of them marked
-- required, but `products` had nowhere to put them and Upload.tsx never read
-- them back out of form state. Every answer was discarded on submit.
--
-- Array vs scalar mirrors the field type in the upload form: `multiselect` /
-- `size-selector` fields collect many values, `select` fields collect one.

alter table public.products
  add column if not exists pattern text[] null,
  add column if not exists occasion text[] null,
  add column if not exists neck_type text null,
  add column if not exists sleeve_type text null,
  add column if not exists collar_type text null,
  add column if not exists country_of_origin text null,
  add column if not exists waist_sizes text[] null,
  add column if not exists lengths text[] null;

comment on column public.products.pattern is
  'Vendor-selected pattern(s) at listing time. Array to support multiselect subcategories.';
comment on column public.products.occasion is
  'Vendor-selected occasion(s) at listing time (multiselect).';
comment on column public.products.neck_type is
  'Neckline type — populated for tops/dresses/t-shirts. Null for categories without a neckline (e.g. shirts use collar_type instead).';
comment on column public.products.sleeve_type is
  'Sleeve type, where the subcategory collects it.';
comment on column public.products.collar_type is
  'Collar type — populated for shirts. Null for categories without a collar (they use neck_type instead).';
comment on column public.products.country_of_origin is
  'Vendor-selected country of origin — required at listing time on every product, previously collected but never persisted.';
comment on column public.products.waist_sizes is
  'Jeans/trousers waist sizes, distinct from the general sizes[] column which holds letter sizes.';
comment on column public.products.lengths is
  'Jeans/trousers inseam length options, distinct from sizes[].';
