-- Category pictures the team can change (Mitra, 2026-10-14: "the manager admin should be able to
-- change the pictures of the categories on the buyer side, on New Arrivals and on the Categories page").
--
--   public.category_images   one row per picture SLOT, seeded here from the buyer app's list
--                            (src/lib/categoryImageSlots.ts; scripts/category-image-slots-check.mjs
--                            compares the two). `id` is the slot, so the Admin Log names it:
--                              new-arrivals/<key>        New Arrivals' "Shop by category" tiles (12)
--                              categories/<top>          a category's banner on /categories (11)
--                              categories/<top>/<sub>    a sub-category's tile on /categories (168)
--                            `image_path` is null while the app's own default shows, else an object
--                            in the public `site-content` bucket under categories/<uuid>.<ext>.
--
-- WHO: super admins and managers (Mitra named the manager), through two RPCs only:
--   admin_category_images()                  every slot and its picture, for Cosora-Admin
--   admin_category_image_set(slot, path)     set a picture, or null for the default; returns the
--                                            path it replaced, so the panel removes that object
--                                            after the row (row first, then the object).
-- The table carries trg_admin_audit, so each change is in the Admin Log with the slot.
--
-- READS: anyone reads the slots that have a picture (RLS), through column grants. The buyer app
-- reads them from site-config/site.json: trg_category_images_snapshot queues the same rebuild as
-- the theme and banners (site_config_queue_snapshot), and the site-config-snapshot function adds
-- a `category_images` map. A change reaches visitors in about a minute.
--
-- STORAGE: four policies let super admins and managers select, insert, update and delete
-- categories/<uuid>.<jpg|jpeg|png|webp> in site-content; the banner policies are untouched.
--
-- No DROP of a table or function and no DELETE anywhere in this file.

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.category_images (
  id          text primary key
              constraint category_images_id check (char_length(id) <= 120
                and id ~ '^(new-arrivals|categories)/[a-z0-9-]+(/[a-z0-9-]+)?$'),
  surface     text not null
              constraint category_images_surface check (surface in ('new_arrivals', 'categories_banner', 'categories_tile')),
  label       text not null constraint category_images_label check (char_length(label) between 1 and 80),
  group_label text,
  position    integer not null,
  image_path  text
              constraint category_images_image_path check (image_path is null
                or image_path ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.category_images enable row level security;

drop policy if exists category_images_public_read on public.category_images;
create policy category_images_public_read on public.category_images
  for select to anon, authenticated
  using (image_path is not null);

revoke all on public.category_images from anon, authenticated;
grant select (id, image_path, updated_at) on public.category_images to anon, authenticated;

-- ── Seed: every slot the buyer app shows, with no picture (the app's defaults) ─
insert into public.category_images (id, surface, label, group_label, position)
values
  ('new-arrivals/womens-apparel', 'new_arrivals', 'Women''s Apparel', null, 1),
  ('new-arrivals/mens-apparel', 'new_arrivals', 'Men''s Apparel', null, 2),
  ('new-arrivals/mens-jeans', 'new_arrivals', 'Men''s Jeans', null, 3),
  ('new-arrivals/mens-shirt', 'new_arrivals', 'Men''s Shirt', null, 4),
  ('new-arrivals/accessories', 'new_arrivals', 'Accessories', null, 5),
  ('new-arrivals/womens-trousers', 'new_arrivals', 'Women''s Trousers', null, 6),
  ('new-arrivals/womens-tshirts', 'new_arrivals', 'Women''s T-shirts', null, 7),
  ('new-arrivals/womens-shoes', 'new_arrivals', 'Women''s Shoes', null, 8),
  ('new-arrivals/kidswear', 'new_arrivals', 'Kidswear', null, 9),
  ('new-arrivals/ethnic-wear', 'new_arrivals', 'Ethnic Wear', null, 10),
  ('new-arrivals/activewear', 'new_arrivals', 'Activewear', null, 11),
  ('new-arrivals/winter-wear', 'new_arrivals', 'Winter Wear', null, 12),
  ('categories/menswear', 'categories_banner', 'Menswear', 'Menswear', 1),
  ('categories/menswear/t-shirts', 'categories_tile', 'T-Shirts', 'Menswear', 2),
  ('categories/menswear/shirts', 'categories_tile', 'Shirts', 'Menswear', 3),
  ('categories/menswear/bottomwear', 'categories_tile', 'Bottomwear', 'Menswear', 4),
  ('categories/menswear/ethnic-wear', 'categories_tile', 'Ethnic Wear', 'Menswear', 5),
  ('categories/menswear/co-ord-sets', 'categories_tile', 'Co-ord Sets', 'Menswear', 6),
  ('categories/menswear/sportswear-upper-body', 'categories_tile', 'Sportswear — Upper Body', 'Menswear', 7),
  ('categories/menswear/sportswear-lower-body', 'categories_tile', 'Sportswear — Lower Body', 'Menswear', 8),
  ('categories/menswear/summer-jackets', 'categories_tile', 'Summer Jackets', 'Menswear', 9),
  ('categories/menswear/winterwear', 'categories_tile', 'Winterwear', 'Menswear', 10),
  ('categories/menswear/formal-suits', 'categories_tile', 'Formal Suits', 'Menswear', 11),
  ('categories/menswear/innerwear', 'categories_tile', 'Innerwear', 'Menswear', 12),
  ('categories/womenswear', 'categories_banner', 'Womenswear', 'Womenswear', 13),
  ('categories/womenswear/t-shirts', 'categories_tile', 'T-Shirts', 'Womenswear', 14),
  ('categories/womenswear/tops-blouses-shirts', 'categories_tile', 'Tops / Blouses / Shirts', 'Womenswear', 15),
  ('categories/womenswear/dresses', 'categories_tile', 'Dresses', 'Womenswear', 16),
  ('categories/womenswear/jumpsuits-playsuits', 'categories_tile', 'Jumpsuits & Playsuits', 'Womenswear', 17),
  ('categories/womenswear/bottomwear', 'categories_tile', 'Bottomwear', 'Womenswear', 18),
  ('categories/womenswear/skirts', 'categories_tile', 'Skirts', 'Womenswear', 19),
  ('categories/womenswear/ethnic-wear', 'categories_tile', 'Ethnic Wear', 'Womenswear', 20),
  ('categories/womenswear/saree', 'categories_tile', 'Saree', 'Womenswear', 21),
  ('categories/womenswear/nightwear-loungewear', 'categories_tile', 'Nightwear & Loungewear', 'Womenswear', 22),
  ('categories/womenswear/jackets-shrugs', 'categories_tile', 'Jackets & Shrugs', 'Womenswear', 23),
  ('categories/womenswear/formal-suits', 'categories_tile', 'Formal Suits', 'Womenswear', 24),
  ('categories/womenswear/winterwear', 'categories_tile', 'Winterwear', 'Womenswear', 25),
  ('categories/womenswear/sportswear-upper-body', 'categories_tile', 'Sportswear — Upper Body', 'Womenswear', 26),
  ('categories/womenswear/sportswear-lower-body', 'categories_tile', 'Sportswear — Lower Body', 'Womenswear', 27),
  ('categories/womenswear/maternity-wear', 'categories_tile', 'Maternity Wear', 'Womenswear', 28),
  ('categories/womenswear/bra', 'categories_tile', 'Bra', 'Womenswear', 29),
  ('categories/womenswear/panties', 'categories_tile', 'Panties', 'Womenswear', 30),
  ('categories/womenswear/lingerie-sets', 'categories_tile', 'Lingerie Sets', 'Womenswear', 31),
  ('categories/womenswear/shapewear', 'categories_tile', 'Shapewear', 'Womenswear', 32),
  ('categories/kidswear', 'categories_banner', 'Kids'' Wear', 'Kids'' Wear', 33),
  ('categories/kidswear/babywear-onesies', 'categories_tile', 'Babywear / Onesies', 'Kids'' Wear', 34),
  ('categories/kidswear/t-shirts-vests-tops', 'categories_tile', 'T-shirts, Vests & Tops', 'Kids'' Wear', 35),
  ('categories/kidswear/frocks-dresses', 'categories_tile', 'Frocks / Dresses', 'Kids'' Wear', 36),
  ('categories/kidswear/co-ords-sets', 'categories_tile', 'Co-ords / Sets', 'Kids'' Wear', 37),
  ('categories/kidswear/bottomwear', 'categories_tile', 'Bottomwear', 'Kids'' Wear', 38),
  ('categories/kidswear/winterwear', 'categories_tile', 'Winterwear', 'Kids'' Wear', 39),
  ('categories/kidswear/ethnic-wear', 'categories_tile', 'Ethnic Wear', 'Kids'' Wear', 40),
  ('categories/footwear', 'categories_banner', 'Footwear', 'Footwear', 41),
  ('categories/footwear/mens-footwear', 'categories_tile', 'Men''s Footwear', 'Footwear', 42),
  ('categories/footwear/womens-footwear', 'categories_tile', 'Women''s Footwear', 'Footwear', 43),
  ('categories/footwear/kids-footwear', 'categories_tile', 'Kids'' Footwear', 'Footwear', 44),
  ('categories/accessories', 'categories_banner', 'Fashion Accessories', 'Fashion Accessories', 45),
  ('categories/accessories/bags', 'categories_tile', 'Bags', 'Fashion Accessories', 46),
  ('categories/accessories/belts', 'categories_tile', 'Belts', 'Fashion Accessories', 47),
  ('categories/accessories/caps-hats', 'categories_tile', 'Caps & Hats', 'Fashion Accessories', 48),
  ('categories/accessories/scarves-stoles', 'categories_tile', 'Scarves & Stoles', 'Fashion Accessories', 49),
  ('categories/accessories/sunglasses', 'categories_tile', 'Sunglasses', 'Fashion Accessories', 50),
  ('categories/accessories/watches', 'categories_tile', 'Watches', 'Fashion Accessories', 51),
  ('categories/accessories/jewellery', 'categories_tile', 'Jewellery', 'Fashion Accessories', 52),
  ('categories/accessories/bibs', 'categories_tile', 'Bibs', 'Fashion Accessories', 53),
  ('categories/accessories/hair-accessories', 'categories_tile', 'Hair Accessories', 'Fashion Accessories', 54),
  ('categories/accessories/office-accessories', 'categories_tile', 'Office Accessories', 'Fashion Accessories', 55),
  ('categories/accessories/umbrellas', 'categories_tile', 'Umbrellas', 'Fashion Accessories', 56),
  ('categories/accessories/phone-cases', 'categories_tile', 'Phone Cases', 'Fashion Accessories', 57),
  ('categories/accessories/socks', 'categories_tile', 'Socks', 'Fashion Accessories', 58),
  ('categories/accessories/gloves', 'categories_tile', 'Gloves', 'Fashion Accessories', 59),
  ('categories/beauty', 'categories_banner', 'Beauty & Cosmetics', 'Beauty & Cosmetics', 60),
  ('categories/beauty/skincare', 'categories_tile', 'Skincare', 'Beauty & Cosmetics', 61),
  ('categories/beauty/makeup', 'categories_tile', 'Makeup', 'Beauty & Cosmetics', 62),
  ('categories/beauty/lip-products', 'categories_tile', 'Lip Products', 'Beauty & Cosmetics', 63),
  ('categories/beauty/eye-brow-products', 'categories_tile', 'Eye & Brow Products', 'Beauty & Cosmetics', 64),
  ('categories/beauty/hair-scalp', 'categories_tile', 'Hair & Scalp', 'Beauty & Cosmetics', 65),
  ('categories/beauty/nail-products', 'categories_tile', 'Nail Products', 'Beauty & Cosmetics', 66),
  ('categories/beauty/fragrances', 'categories_tile', 'Fragrances', 'Beauty & Cosmetics', 67),
  ('categories/beauty/bath-body', 'categories_tile', 'Bath & Body', 'Beauty & Cosmetics', 68),
  ('categories/beauty/beauty-tools-accessories', 'categories_tile', 'Beauty Tools & Accessories', 'Beauty & Cosmetics', 69),
  ('categories/beauty/mens-grooming', 'categories_tile', 'Men''s Grooming', 'Beauty & Cosmetics', 70),
  ('categories/beauty/beauty-devices', 'categories_tile', 'Beauty Devices', 'Beauty & Cosmetics', 71),
  ('categories/packaging', 'categories_banner', 'Packaging', 'Packaging', 72),
  ('categories/packaging/packaging-bags-polybags', 'categories_tile', 'Packaging Bags & Polybags', 'Packaging', 73),
  ('categories/packaging/paper-bags', 'categories_tile', 'Paper Bags', 'Packaging', 74),
  ('categories/packaging/corrugated-boxes', 'categories_tile', 'Corrugated Boxes', 'Packaging', 75),
  ('categories/packaging/garment-boxes', 'categories_tile', 'Garment Boxes', 'Packaging', 76),
  ('categories/packaging/envelope-packaging', 'categories_tile', 'Envelope Packaging', 'Packaging', 77),
  ('categories/packaging/ziplock-bags', 'categories_tile', 'Ziplock Bags', 'Packaging', 78),
  ('categories/raw-materials', 'categories_banner', 'Raw Materials', 'Raw Materials', 79),
  ('categories/raw-materials/fabrics', 'categories_tile', 'Fabrics', 'Raw Materials', 80),
  ('categories/raw-materials/yarn', 'categories_tile', 'Yarn', 'Raw Materials', 81),
  ('categories/raw-materials/lining-interlining', 'categories_tile', 'Lining & Interlining', 'Raw Materials', 82),
  ('categories/raw-materials/thread', 'categories_tile', 'Thread', 'Raw Materials', 83),
  ('categories/raw-materials/laces-nets', 'categories_tile', 'Laces & Nets', 'Raw Materials', 84),
  ('categories/raw-materials/tapes-cords', 'categories_tile', 'Tapes & Cords', 'Raw Materials', 85),
  ('categories/raw-materials/elastics', 'categories_tile', 'Elastics', 'Raw Materials', 86),
  ('categories/raw-materials/dyes', 'categories_tile', 'Dyes', 'Raw Materials', 87),
  ('categories/raw-materials/chemicals', 'categories_tile', 'Chemicals', 'Raw Materials', 88),
  ('categories/raw-materials/finishes', 'categories_tile', 'Finishes', 'Raw Materials', 89),
  ('categories/raw-materials/labels-tags', 'categories_tile', 'Labels & Tags', 'Raw Materials', 90),
  ('categories/trims-home', 'categories_banner', 'Trims & Home Textile', 'Trims & Home Textile', 91),
  ('categories/trims-home/buttons', 'categories_tile', 'Buttons', 'Trims & Home Textile', 92),
  ('categories/trims-home/zippers', 'categories_tile', 'Zippers', 'Trims & Home Textile', 93),
  ('categories/trims-home/hook-eye', 'categories_tile', 'Hook & Eye', 'Trims & Home Textile', 94),
  ('categories/trims-home/velcro-tape', 'categories_tile', 'Velcro Tape', 'Trims & Home Textile', 95),
  ('categories/trims-home/drawcords-toggles', 'categories_tile', 'Drawcords & Toggles', 'Trims & Home Textile', 96),
  ('categories/trims-home/eyelets-grommets', 'categories_tile', 'Eyelets & Grommets', 'Trims & Home Textile', 97),
  ('categories/trims-home/rivets-studs', 'categories_tile', 'Rivets & Studs', 'Trims & Home Textile', 98),
  ('categories/trims-home/cord-locks-stoppers', 'categories_tile', 'Cord Locks & Stoppers', 'Trims & Home Textile', 99),
  ('categories/trims-home/patches', 'categories_tile', 'Patches', 'Trims & Home Textile', 100),
  ('categories/trims-home/tassels-fringes', 'categories_tile', 'Tassels & Fringes', 'Trims & Home Textile', 101),
  ('categories/trims-home/mannequins-display', 'categories_tile', 'Mannequins & Display', 'Trims & Home Textile', 102),
  ('categories/trims-home/bedding-bed-linen', 'categories_tile', 'Bedding & Bed Linen', 'Trims & Home Textile', 103),
  ('categories/trims-home/towels-bath-linen', 'categories_tile', 'Towels & Bath Linen', 'Trims & Home Textile', 104),
  ('categories/trims-home/curtains-drapes', 'categories_tile', 'Curtains & Drapes', 'Trims & Home Textile', 105),
  ('categories/trims-home/cushions-covers', 'categories_tile', 'Cushions & Covers', 'Trims & Home Textile', 106),
  ('categories/trims-home/table-linen', 'categories_tile', 'Table Linen', 'Trims & Home Textile', 107),
  ('categories/trims-home/carpets-rugs', 'categories_tile', 'Carpets & Rugs', 'Trims & Home Textile', 108),
  ('categories/trims-home/upholstery-fabric', 'categories_tile', 'Upholstery Fabric', 'Trims & Home Textile', 109),
  ('categories/trims-home/kitchen-textiles', 'categories_tile', 'Kitchen Textiles', 'Trims & Home Textile', 110),
  ('categories/trims-home/industrial-uniform', 'categories_tile', 'Industrial / Uniform', 'Trims & Home Textile', 111),
  ('categories/services', 'categories_banner', 'B2B Services', 'B2B Services', 112),
  ('categories/services/dyeing', 'categories_tile', 'Dyeing', 'B2B Services', 113),
  ('categories/services/printing', 'categories_tile', 'Printing', 'B2B Services', 114),
  ('categories/services/embroidery', 'categories_tile', 'Embroidery', 'B2B Services', 115),
  ('categories/services/processing-finishing', 'categories_tile', 'Processing & Finishing', 'B2B Services', 116),
  ('categories/services/stitching-garmenting', 'categories_tile', 'Stitching / Garmenting', 'B2B Services', 117),
  ('categories/services/cutting', 'categories_tile', 'Cutting', 'B2B Services', 118),
  ('categories/services/final-packaging', 'categories_tile', 'Final Packaging', 'B2B Services', 119),
  ('categories/services/quality-check-qc', 'categories_tile', 'Quality Check (QC)', 'B2B Services', 120),
  ('categories/services/pattern-making-cad', 'categories_tile', 'Pattern Making / CAD', 'B2B Services', 121),
  ('categories/services/tech-pack-development', 'categories_tile', 'Tech Pack Development', 'B2B Services', 122),
  ('categories/services/fashion-designing', 'categories_tile', 'Fashion Designing', 'B2B Services', 123),
  ('categories/services/fabric-trims-sourcing', 'categories_tile', 'Fabric & Trims Sourcing', 'B2B Services', 124),
  ('categories/services/logistics-transportation', 'categories_tile', 'Logistics & Transportation', 'B2B Services', 125),
  ('categories/services/warehousing', 'categories_tile', 'Warehousing', 'B2B Services', 126),
  ('categories/services/import-export-handling', 'categories_tile', 'Import / Export Handling', 'B2B Services', 127),
  ('categories/services/app-development', 'categories_tile', 'App Development', 'B2B Services', 128),
  ('categories/services/erp-saas-software', 'categories_tile', 'ERP / SaaS Software', 'B2B Services', 129),
  ('categories/services/crm-automation', 'categories_tile', 'CRM & Automation', 'B2B Services', 130),
  ('categories/services/accounting-billing-software', 'categories_tile', 'Accounting & Billing Software', 'B2B Services', 131),
  ('categories/services/b2b-directory-listings', 'categories_tile', 'B2B Directory Listings', 'B2B Services', 132),
  ('categories/services/accounting-services', 'categories_tile', 'Accounting Services', 'B2B Services', 133),
  ('categories/services/income-tax-filing', 'categories_tile', 'Income Tax Filing', 'B2B Services', 134),
  ('categories/services/business-registration', 'categories_tile', 'Business Registration', 'B2B Services', 135),
  ('categories/services/fundraising-support', 'categories_tile', 'Fundraising Support', 'B2B Services', 136),
  ('categories/services/marketing', 'categories_tile', 'Marketing', 'B2B Services', 137),
  ('categories/services/e-commerce', 'categories_tile', 'E-commerce', 'B2B Services', 138),
  ('categories/services/brand-consulting', 'categories_tile', 'Brand Consulting', 'B2B Services', 139),
  ('categories/services/social-media-marketing', 'categories_tile', 'Social Media Marketing', 'B2B Services', 140),
  ('categories/services/performance-marketing', 'categories_tile', 'Performance Marketing', 'B2B Services', 141),
  ('categories/services/public-relations', 'categories_tile', 'Public Relations', 'B2B Services', 142),
  ('categories/services/photography', 'categories_tile', 'Photography', 'B2B Services', 143),
  ('categories/services/sewing-machines', 'categories_tile', 'Sewing Machines', 'B2B Services', 144),
  ('categories/services/cutting-machines', 'categories_tile', 'Cutting Machines', 'B2B Services', 145),
  ('categories/services/pressing-finishing', 'categories_tile', 'Pressing & Finishing', 'B2B Services', 146),
  ('categories/services/embroidery-machines', 'categories_tile', 'Embroidery Machines', 'B2B Services', 147),
  ('categories/services/printing-machines', 'categories_tile', 'Printing Machines', 'B2B Services', 148),
  ('categories/services/washing-finishing', 'categories_tile', 'Washing & Finishing', 'B2B Services', 149),
  ('categories/services/packaging-machinery', 'categories_tile', 'Packaging Machinery', 'B2B Services', 150),
  ('categories/services/testing-qc-equipment', 'categories_tile', 'Testing & QC Equipment', 'B2B Services', 151),
  ('categories/services/thrift-resale', 'categories_tile', 'Thrift / Resale', 'B2B Services', 152),
  ('categories/services/dead-stock-surplus', 'categories_tile', 'Dead Stock & Surplus', 'B2B Services', 153),
  ('categories/services/vintage-retro', 'categories_tile', 'Vintage & Retro', 'B2B Services', 154),
  ('categories/services/upcycled-reworked', 'categories_tile', 'Upcycled & Reworked', 'B2B Services', 155),
  ('categories/services/rental-fashion', 'categories_tile', 'Rental Fashion', 'B2B Services', 156),
  ('categories/services/fabric-scrap-recycling', 'categories_tile', 'Fabric Scrap & Recycling', 'B2B Services', 157),
  ('categories/freelancers', 'categories_banner', 'Freelancer Services', 'Freelancer Services', 158),
  ('categories/freelancers/fashion-designing', 'categories_tile', 'Fashion Designing', 'Freelancer Services', 159),
  ('categories/freelancers/tech-pack-creation', 'categories_tile', 'Tech Pack Creation', 'Freelancer Services', 160),
  ('categories/freelancers/all-item-sourcing', 'categories_tile', 'All Item Sourcing', 'Freelancer Services', 161),
  ('categories/freelancers/garment-fit-consulting', 'categories_tile', 'Garment Fit Consulting', 'Freelancer Services', 162),
  ('categories/freelancers/e-commerce', 'categories_tile', 'E-commerce', 'Freelancer Services', 163),
  ('categories/freelancers/marketing-sales', 'categories_tile', 'Marketing & Sales', 'Freelancer Services', 164),
  ('categories/freelancers/performance-marketing', 'categories_tile', 'Performance Marketing', 'Freelancer Services', 165),
  ('categories/freelancers/influencer-marketing', 'categories_tile', 'Influencer Marketing', 'Freelancer Services', 166),
  ('categories/freelancers/pr-media', 'categories_tile', 'PR & Media', 'Freelancer Services', 167),
  ('categories/freelancers/software-support', 'categories_tile', 'Software Support', 'Freelancer Services', 168),
  ('categories/freelancers/crm-customer-support', 'categories_tile', 'CRM & Customer Support', 'Freelancer Services', 169),
  ('categories/freelancers/financial-consulting', 'categories_tile', 'Financial Consulting', 'Freelancer Services', 170),
  ('categories/freelancers/accounting-bookkeeping', 'categories_tile', 'Accounting & Bookkeeping', 'Freelancer Services', 171),
  ('categories/freelancers/legal-compliance', 'categories_tile', 'Legal & Compliance', 'Freelancer Services', 172),
  ('categories/freelancers/photography-videography', 'categories_tile', 'Photography & Videography', 'Freelancer Services', 173),
  ('categories/freelancers/content-creation', 'categories_tile', 'Content Creation', 'Freelancer Services', 174),
  ('categories/freelancers/cataloging', 'categories_tile', 'Cataloging', 'Freelancer Services', 175),
  ('categories/freelancers/model-coordination', 'categories_tile', 'Model Coordination', 'Freelancer Services', 176),
  ('categories/freelancers/styling-services', 'categories_tile', 'Styling Services', 'Freelancer Services', 177),
  ('categories/freelancers/warehouse-logistics', 'categories_tile', 'Warehouse & Logistics', 'Freelancer Services', 178),
  ('categories/freelancers/product-sampling', 'categories_tile', 'Product Sampling', 'Freelancer Services', 179)
on conflict (id) do update
  set surface = excluded.surface, label = excluded.label,
      group_label = excluded.group_label, position = excluded.position;

drop trigger if exists trg_admin_audit on public.category_images;
create trigger trg_admin_audit after insert or update or delete on public.category_images
  for each row execute function admin.audit_row_change('');

-- ── Who may change them ──────────────────────────────────────────────────────
create or replace function admin.require_category_image_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce(public.admin_role()::text, '') not in ('super_admin', 'manager') then
    raise exception 'not authorized: super admins and managers only' using errcode = '42501';
  end if;
end
$function$;
revoke all on function admin.require_category_image_admin() from public, anon, authenticated;

create or replace function public.admin_category_images()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform admin.require_category_image_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
            'slot', c.id, 'surface', c.surface, 'label', c.label, 'group_label', c.group_label,
            'position', c.position, 'image_path', c.image_path,
            'updated_at', case when c.updated_by is null and c.image_path is null then null else c.updated_at end,
            'updated_by_name', admin.audit_actor_name(c.updated_by))
            order by case c.surface when 'new_arrivals' then 0 else 1 end, c.position, c.id)
          from public.category_images c), '[]'::jsonb);
end
$function$;

create or replace function public.admin_category_image_set(p_slot text, p_image_path text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_img  text := nullif(btrim(coalesce(p_image_path, '')), '');
  v_prev text;
begin
  perform admin.require_category_image_admin();

  select c.image_path into v_prev from public.category_images c where c.id = p_slot for update;
  if not found then
    raise exception 'That picture slot doesn''t exist. Reload the page.' using errcode = 'P0002';
  end if;
  if v_img is not null and v_img !~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception 'The picture must be one uploaded from this page.' using errcode = '22023';
  elsif v_img is not null and not exists (select 1 from storage.objects o
                                           where o.bucket_id = 'site-content' and o.name = v_img) then
    raise exception 'That picture isn''t uploaded. Upload it again.' using errcode = '22023';
  end if;

  if v_prev is not distinct from v_img then
    return null;  -- nothing changed, nothing to remove
  end if;

  update public.category_images c
     set image_path = v_img, updated_by = auth.uid(), updated_at = now()
   where c.id = p_slot;
  -- The caller removes the replaced object after this commits (row first, then the object).
  return v_prev;
end
$function$;

revoke all on function public.admin_category_images(), public.admin_category_image_set(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_category_images(), public.admin_category_image_set(text, text) to authenticated;

-- ── Storage: categories/<uuid>.<ext> in site-content ─────────────────────────
drop policy if exists site_content_category_select on storage.objects;
create policy site_content_category_select on storage.objects for select to authenticated
  using (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
         and (select public.admin_role())::text in ('super_admin', 'manager'));
drop policy if exists site_content_category_insert on storage.objects;
create policy site_content_category_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
              and (select public.admin_role())::text in ('super_admin', 'manager'));
drop policy if exists site_content_category_update on storage.objects;
create policy site_content_category_update on storage.objects for update to authenticated
  using (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
         and (select public.admin_role())::text in ('super_admin', 'manager'))
  with check (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
              and (select public.admin_role())::text in ('super_admin', 'manager'));
drop policy if exists site_content_category_delete on storage.objects;
create policy site_content_category_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-content' and name ~ '^categories/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
         and (select public.admin_role())::text in ('super_admin', 'manager'));

-- ── Snapshot: the same one rebuild per transaction as the theme and banners ──
drop trigger if exists trg_category_images_snapshot on public.category_images;
create trigger trg_category_images_snapshot
  after insert or update or delete or truncate on public.category_images
  for each statement execute function public.site_config_queue_snapshot();

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.category_images'::regclass) then
    raise exception 'self-check: RLS is off on category_images';
  end if;
  if has_table_privilege('anon', 'public.category_images', 'INSERT')
     or has_table_privilege('authenticated', 'public.category_images', 'UPDATE')
     or has_table_privilege('authenticated', 'public.category_images', 'DELETE')
     or has_column_privilege('anon', 'public.category_images', 'updated_by', 'SELECT')
     or not has_column_privilege('anon', 'public.category_images', 'image_path', 'SELECT') then
    raise exception 'self-check: client grants on category_images are wrong';
  end if;
  foreach f in array array['admin_category_images()', 'admin_category_image_set(text,text)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or not (select p.prosecdef from pg_proc p where p.oid = ('public.' || f)::regprocedure) then
      raise exception 'self-check: % has the wrong grants or is not SECURITY DEFINER', f;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'site_content_category_%') <> 4 then
    raise exception 'self-check: the four category storage policies are missing';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.category_images'::regclass
        and tgname in ('trg_admin_audit', 'trg_category_images_snapshot')) <> 2 then
    raise exception 'self-check: a category_images trigger is missing';
  end if;
  if (select count(*) from public.category_images) <> 191
     or (select count(*) from public.category_images where surface = 'new_arrivals') <> 12
     or (select count(*) from public.category_images where surface = 'categories_banner') <> 11 then
    raise exception 'self-check: expected 191 slots (12 New Arrivals tiles, 11 banners, 168 tiles), found %',
      (select count(*) from public.category_images);
  end if;
end
$check$;
