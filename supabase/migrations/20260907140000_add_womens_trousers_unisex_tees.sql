-- Close out the legacy/tree taxonomy split: the last two missing children.
--
-- 20260907130200 re-pointed 23 of 30 products and deliberately left three live
-- rows on legacy buckets because the tree had nowhere honest to put them. Those
-- three gaps are now filled, and this is the migration that empties the legacy
-- generation of live inventory entirely.
--
-- Both rows are gaps, not inventions, and the distinction is the same one
-- add_activewear_winterwear_children turned on:
--
--   Women's Pants/Trousers -- the tree already carries Men's Pants/Trousers,
--     Men's Jeans, Men's Shirts, Men's T-Shirts, Women's Tops, Women's Dresses
--     and Women's Ethnic Wear. A women's trouser row is the one obviously
--     missing cell in a matrix the taxonomy already commits to, and the legacy
--     scheme's flat `Trousers` bucket held exactly such a product.
--
--   Unisex T-Shirts -- Apparel & Home splits tees by gender (Men's T-Shirts /
--     Women's Tops) with no unisex leaf, yet unisex tees are a real and common
--     apparel SKU and one is live in this catalogue right now. Adding the leaf
--     is what lets a Unisex product keep being Unisex instead of being filed
--     under a gender it does not claim.
--
-- Belts already exists under Fashion Accessories (Unisex) and needs nothing.
--
-- Idempotent through categories_name_parent_uniq, same shape as
-- seed_category_taxonomy_tree and add_activewear_winterwear_children.
-- src/data/sellerCategories.ts gains both in the same commit, so vendors can
-- select them going forward rather than these being orphaned DB rows.

insert into public.categories (name, grp, parent_id)
select v.sub, 'Apparel & Home Categories', p.id
from (values
  ('Women''s Pants/Trousers'),
  ('Unisex T-Shirts')
) as v(sub)
join public.categories p
  on p.name = 'Apparel & Home Categories' and p.parent_id is null
on conflict (name, parent_id) do nothing;

-- ── Re-point the last three legacy-pinned live products ──
-- Same UPDATE shape as 20260907130200: resolve the target by (name, parent) and
-- match the source row by id. The three categorisation calls were made by the
-- owner, so unlike that migration this one does not need gender to disambiguate
-- -- each product maps to exactly one stated target.
--
-- This fires trg_products_enqueue_embedding (category_id is in its column list)
-- and sync_product_category_name, so all three rows re-enter the embedding
-- queue with corrected search_text. Expected and correct; not suppressed.
update public.products p
set category_id = t.id
from (values
  ('b0000000-0000-0000-0000-000000000015'::uuid, 'Women''s Pants/Trousers'),
  ('b0000000-0000-0000-0000-000000000003'::uuid, 'Unisex T-Shirts')
) as v(pid, target)
join public.categories t
  on t.name = v.target
 and t.parent_id = (select id from public.categories
                     where name = 'Apparel & Home Categories' and parent_id is null)
where p.id = v.pid;

-- Leather Belt -> Belts, an existing child of Fashion Accessories (Unisex).
-- Resolved by (name, parent) rather than the literal uuid so this migration
-- reproduces on a fresh database, where that id would differ.
update public.products p
set category_id = t.id
from public.categories t
join public.categories par on par.id = t.parent_id
where t.name = 'Belts'
  and par.name = 'Fashion Accessories (Unisex)' and par.parent_id is null
  and p.id = 'b0000000-0000-0000-0000-000000000008';

-- Still on legacy rows after this, and correctly so: three `draft` listings
-- (name 'Abhishek Mitra', Accessories, gender null) with neither a gender nor a
-- usable name to reason from. They are drafts, so they reach no buyer and
-- cannot affect matching. The 11 legacy rows themselves stay -- vendorOnboarding.ts's
-- resolveCategoryId fallback still maps free text onto exactly those names.
