-- Seed the real product taxonomy into public.categories as a parent -> subcategory
-- tree, generated from src/data/sellerCategories.ts.
--
-- Until now the table held 11 flat rows and Upload.tsx picked one of them by
-- regex-matching the PRODUCT NAME (resolveCategoryId), discarding the
-- subcategory the vendor had explicitly selected two steps earlier. The
-- self-referencing parent_id column already existed but was never used.
--
-- The 11 legacy rows are deliberately left untouched: 29 published products
-- reference them, and re-pointing those rows is a data decision, not something
-- to infer here. They keep parent_id = null and are unaffected by this seed.

-- Idempotency, and a real integrity guarantee. NULLS NOT DISTINCT (PG15+) is
-- what makes the top-level rows collide on name at all — under the default
-- NULLS DISTINCT, every (name, null) pair is considered unique and duplicate
-- parents could be inserted freely.
create unique index if not exists categories_name_parent_uniq
  on public.categories (name, parent_id) nulls not distinct;

-- Parents: the seller taxonomy's product categories. grp = 'Taxonomy' marks
-- them as tree roots, distinguishing them from the legacy leaf rows whose grp
-- is a display group ('Apparel', 'Accessories', 'Footwear').
insert into public.categories (name, grp, parent_id)
select v.name, 'Taxonomy', null
from (values
  ('Fashion Accessories (Unisex)'),
  ('Raw Materials – Fabrics & Inputs'),
  ('Trims & Accessories'),
  ('Labels & Tags'),
  ('Packaging'),
  ('Apparel & Home Categories'),
  ('Machinery & Equipment'),
  ('Chemicals & Dyes'),
  ('Cosmetics & Beauty')
) as v(name)
on conflict (name, parent_id) do nothing;

-- Children: every product subcategory a vendor can actually pick.
insert into public.categories (name, grp, parent_id)
select v.sub, v.parent, p.id
from (values
  ('Fashion Accessories (Unisex)', 'Bags'),
  ('Fashion Accessories (Unisex)', 'Belts'),
  ('Fashion Accessories (Unisex)', 'Caps & Hats'),
  ('Fashion Accessories (Unisex)', 'Scarves & Stoles'),
  ('Fashion Accessories (Unisex)', 'Sunglasses'),
  ('Fashion Accessories (Unisex)', 'Watches'),
  ('Fashion Accessories (Unisex)', 'Jewellery'),
  ('Fashion Accessories (Unisex)', 'Socks'),
  ('Fashion Accessories (Unisex)', 'Gloves'),
  ('Raw Materials – Fabrics & Inputs', 'Knitted Fabrics'),
  ('Raw Materials – Fabrics & Inputs', 'Woven Fabrics'),
  ('Raw Materials – Fabrics & Inputs', 'Denim'),
  ('Raw Materials – Fabrics & Inputs', 'Terry & Fleece'),
  ('Raw Materials – Fabrics & Inputs', 'Sustainable Fabrics'),
  ('Raw Materials – Fabrics & Inputs', 'Yarns'),
  ('Raw Materials – Fabrics & Inputs', 'Threads'),
  ('Raw Materials – Fabrics & Inputs', 'Linings & Interlinings'),
  ('Raw Materials – Fabrics & Inputs', 'Laces & Nets'),
  ('Raw Materials – Fabrics & Inputs', 'Tapes & Cords'),
  ('Raw Materials – Fabrics & Inputs', 'Elastics'),
  ('Raw Materials – Fabrics & Inputs', 'Dyes'),
  ('Raw Materials – Fabrics & Inputs', 'Chemicals'),
  ('Raw Materials – Fabrics & Inputs', 'Finishes'),
  ('Trims & Accessories', 'Buttons'),
  ('Trims & Accessories', 'Zippers'),
  ('Trims & Accessories', 'Hook & Eye'),
  ('Trims & Accessories', 'Velcro Tape'),
  ('Trims & Accessories', 'Elastic'),
  ('Trims & Accessories', 'Drawcords & Toggles'),
  ('Trims & Accessories', 'Eyelets & Grommets'),
  ('Trims & Accessories', 'Labels'),
  ('Trims & Accessories', 'Lace & Tapes'),
  ('Trims & Accessories', 'Interlining'),
  ('Trims & Accessories', 'Rivets & Studs'),
  ('Trims & Accessories', 'Cord Locks & Stoppers'),
  ('Trims & Accessories', 'Patches'),
  ('Trims & Accessories', 'Tassels & Fringes'),
  ('Labels & Tags', 'Woven Labels'),
  ('Labels & Tags', 'Printed Labels'),
  ('Labels & Tags', 'Hang Tags'),
  ('Labels & Tags', 'Size Tags'),
  ('Labels & Tags', 'Care Labels'),
  ('Labels & Tags', 'Content Labels'),
  ('Labels & Tags', 'RFID / QR Code Labels'),
  ('Packaging', 'Polybags'),
  ('Packaging', 'Paper Bags'),
  ('Packaging', 'Corrugated Boxes'),
  ('Packaging', 'Garment Boxes'),
  ('Packaging', 'Envelope Packaging'),
  ('Packaging', 'Ziplock Bags'),
  ('Packaging', 'Hang Tag String & Seal'),
  ('Packaging', 'Tissue Paper'),
  ('Packaging', 'Stickers & Labels'),
  ('Packaging', 'Packaging Inserts & Accessories'),
  ('Apparel & Home Categories', 'Men''s T-Shirts'),
  ('Apparel & Home Categories', 'Men''s Shirts'),
  ('Apparel & Home Categories', 'Men''s Pants/Trousers'),
  ('Apparel & Home Categories', 'Men''s Jeans'),
  ('Apparel & Home Categories', 'Women''s Tops'),
  ('Apparel & Home Categories', 'Women''s Dresses'),
  ('Apparel & Home Categories', 'Women''s Ethnic Wear'),
  ('Apparel & Home Categories', 'Kids Wear'),
  ('Apparel & Home Categories', 'Footwear'),
  ('Apparel & Home Categories', 'Home Textiles'),
  ('Apparel & Home Categories', 'Other Ready-made Garments'),
  ('Machinery & Equipment', 'Sewing Machines'),
  ('Machinery & Equipment', 'Cutting Machines'),
  ('Machinery & Equipment', 'Pressing & Finishing Machines'),
  ('Machinery & Equipment', 'Embroidery Machines'),
  ('Machinery & Equipment', 'Printing Machines'),
  ('Machinery & Equipment', 'Washing & Finishing Machines'),
  ('Machinery & Equipment', 'Packaging Machinery'),
  ('Machinery & Equipment', 'Testing & QC Equipment'),
  ('Machinery & Equipment', 'Gym Equipment'),
  ('Machinery & Equipment', 'Mannequins & Display'),
  ('Machinery & Equipment', 'Other Clothing Machinery'),
  ('Chemicals & Dyes', 'Textile Chemicals'),
  ('Chemicals & Dyes', 'Dyes'),
  ('Chemicals & Dyes', 'Washing & Finishing Chemicals'),
  ('Cosmetics & Beauty', 'Skincare'),
  ('Cosmetics & Beauty', 'Face Makeup'),
  ('Cosmetics & Beauty', 'Lip Products'),
  ('Cosmetics & Beauty', 'Eye Makeup'),
  ('Cosmetics & Beauty', 'Haircare'),
  ('Cosmetics & Beauty', 'Nail Products'),
  ('Cosmetics & Beauty', 'Fragrances'),
  ('Cosmetics & Beauty', 'Bath & Body'),
  ('Cosmetics & Beauty', 'Beauty Tools & Accessories'),
  ('Cosmetics & Beauty', 'Men''s Grooming'),
  ('Cosmetics & Beauty', 'Oral Care'),
  ('Cosmetics & Beauty', 'Baby & Kids Care'),
  ('Cosmetics & Beauty', 'Essential Oils & Aromatherapy'),
  ('Cosmetics & Beauty', 'Sun Care')
) as v(parent, sub)
join public.categories p on p.name = v.parent and p.parent_id is null
on conflict (name, parent_id) do nothing;
