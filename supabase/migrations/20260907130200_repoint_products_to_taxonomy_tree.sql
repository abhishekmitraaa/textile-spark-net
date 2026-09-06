-- Re-point live products from the legacy flat buckets onto the taxonomy tree.
--
-- Why this is needed now, when the 2026-07-29 seed explicitly deferred it:
-- until now nothing compared category_id ACROSS the buyer/vendor boundary, so
-- the split was invisible. match_vendor_rfqs does exactly that -- its
-- category_match term is `rfqs.category_id = any(vendor's live product
-- category_ids)`. With the buyer picker on the tree and every product on a
-- legacy row, that term would be false for every RFQ against every vendor,
-- forever. Unifying the picker without this migration would make the category
-- signal strictly worse than the boolean it replaced, not better.
--
-- 23 of 26 rows move. The other 3 are deliberately left alone -- see the bottom
-- of this file. Nothing here derives a category from product NAME text; the
-- legacy bucket plus the product's own `gender` column (populated on all 26)
-- are the only inputs, which is what keeps this from repeating the
-- resolveCategoryId mistake this codebase already made once.
--
-- The 11 legacy rows themselves are NOT deleted. vendorOnboarding.ts's
-- bulk-import path still calls resolveCategoryId, whose CATEGORY_KEYWORDS table
-- maps free text onto exactly those names. Migrating that off is separate work.

-- Gender-disambiguated moves onto existing tree children (16 rows).
-- Each pair is (legacy bucket, gender) -> the one tree child it can only mean.
update public.products p
set category_id = t.id
from (values
  ('T-shirts/Tops', 'Men',   'Men''s T-Shirts'),
  ('T-shirts/Tops', 'Women', 'Women''s Tops'),
  ('Shirt',         'Men',   'Men''s Shirts'),
  ('Jeans',         'Men',   'Men''s Jeans'),
  ('Dress',         'Women', 'Women''s Dresses'),
  ('Ethnic Wear',   'Women', 'Women''s Ethnic Wear'),
  ('Kidswear',      'Kids',  'Kids Wear')
) as v(legacy, gender, target)
join public.categories old on old.name = v.legacy and old.parent_id is null
join public.categories t
  on t.name = v.target
 and t.parent_id = (select id from public.categories
                     where name = 'Apparel & Home Categories' and parent_id is null)
where p.category_id = old.id and p.gender = v.gender;

-- Gender-independent moves (7 rows): the legacy bucket and the tree child are
-- the same concept under the same name, so gender never enters into it. This
-- covers Footwear (1) plus the six Activewear / Winter Wear rows the migration
-- alongside this one just created homes for -- including their Unisex members,
-- which are unambiguous here precisely BECAUSE the target is not gendered.
update public.products p
set category_id = t.id
from (values ('Footwear'), ('Activewear'), ('Winter Wear')) as v(nm)
join public.categories old on old.name = v.nm and old.parent_id is null
join public.categories t
  on t.name = v.nm
 and t.parent_id = (select id from public.categories
                     where name = 'Apparel & Home Categories' and parent_id is null)
where p.category_id = old.id;

-- ── Deliberately NOT moved (3 rows) ──
-- Each needs a human decision; forcing a nearest-lookalike is the exact failure
-- this migration exists to avoid.
--
--   b0000000-0000-0000-0000-000000000003  Oversized Graphic Tee  (T-shirts/Tops, Unisex)
--     Tree offers only Men's T-Shirts / Women's Tops. Gender says Unisex, so it
--     resolves to neither, and picking one silently mis-genders the listing.
--
--   b0000000-0000-0000-0000-000000000015  Wide-Leg Trouser  (Trousers, Women)
--     Tree has Men's Pants/Trousers and no women's equivalent. Gender is
--     unambiguous; the taxonomy simply has no row for it.
--
--   b0000000-0000-0000-0000-000000000008  Leather Belt  (Accessories, Men)
--     Parent 'Fashion Accessories (Unisex)' is explicitly gender-neutral, so
--     gender cannot choose among its 9 children. 'Belts' is obvious from the
--     product NAME -- which is precisely the signal this codebase already
--     learned not to trust (see resolveCategoryId's docstring).
--
-- These keep their legacy category_id and are simply unmatched on the category
-- half of the score until someone decides. Their semantic similarity term is
-- unaffected.
