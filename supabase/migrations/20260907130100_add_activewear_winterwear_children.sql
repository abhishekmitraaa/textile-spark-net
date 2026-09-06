-- Add Activewear and Winter Wear as real children of Apparel & Home Categories.
--
-- These are the two gaps the taxonomy tree has against live inventory. The
-- legacy flat scheme had both; the 2026-07-29 tree did not carry them over, and
-- its Apparel & Home children are otherwise gendered (Men's T-Shirts, Women's
-- Dresses, Kids Wear) with only Footwear / Home Textiles / Other Ready-made
-- Garments as gender-neutral leaves.
--
-- Six live products sit in those two legacy buckets right now -- Mesh Training
-- Tee, Mesh Panel Training Tee, Cotton Track Pants, Formal Blazer, Quilted
-- Puffer Jacket, Knit Cardigan. Without these rows the only way to re-point
-- them would be to force each into a nearest-lookalike ("Other Ready-made
-- Garments"), which destroys exactly the distinction the category is for.
--
-- This is the same reasoning as the service-category seed alongside it: not an
-- invention, a concept already present in live inventory that the tree failed
-- to represent. Deliberately gender-neutral, like Footwear -- an activewear tee
-- and a puffer jacket are not usefully split by gender at this level, and the
-- products carry a `gender` column of their own for that.
--
-- src/data/sellerCategories.ts is updated in the same commit, so the vendor
-- upload picker offers these too. The DB and that file must not drift: the file
-- is what every seed here is generated from.

insert into public.categories (name, grp, parent_id)
select v.sub, 'Apparel & Home Categories', p.id
from (values
  ('Activewear'),
  ('Winter Wear')
) as v(sub)
join public.categories p
  on p.name = 'Apparel & Home Categories' and p.parent_id is null
on conflict (name, parent_id) do nothing;

-- Note these do NOT collide with the legacy flat rows of the same name: the
-- unique index is on (name, parent_id) NULLS NOT DISTINCT, and the legacy rows
-- have parent_id = null while these have a parent. Two rows named 'Activewear'
-- now exist by design -- the legacy one stays for vendorOnboarding.ts's
-- free-text fallback (see 20260907130200), the new one is the current taxonomy.
