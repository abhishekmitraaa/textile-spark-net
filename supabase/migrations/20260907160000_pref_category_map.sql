-- Buyer preference id -> real categories.id, as ONE source of truth (Phase 2 prep).
--
-- WHY A TABLE AND NOT A PORT OF THE TS MAP: the brief says to reuse
-- "src/lib/queries/products.ts resolvePreferredCategoryIds". That function does
-- not exist — checked the whole tree. The only consumer of
-- PREF_TO_DB_CATEGORY_NAMES is preferredVideoCategoryNames(), which maps
-- preferences onto `product_videos.category` TEXT for the reel feed, not onto
-- products.category_id. So there was no products-side resolver to call, and the
-- "pass resolved ids in from the frontend" option had no implementation behind
-- it. A table it is.
--
-- AND THE TS MAP IS NOW STALE, which is the more important finding. Its targets
-- are the LEGACY flat category names — 'T-shirts/Tops', 'Shirt', 'Dress',
-- 'Ethnic Wear', 'Trousers', 'Jeans', 'Kidswear'. 20260907130200 and
-- 20260907140000 moved every live product off those rows onto the taxonomy
-- tree, so measured against the live catalogue those seven names now hold
-- **zero live products**. A cold-start built on them would have returned NULL
-- for both buyers who actually have preferences set. This table is not a
-- redefinition of buyer vocabulary — every row below is the tree successor of a
-- legacy name the TS map already pointed at.
--
-- Two names are also genuinely AMBIGUOUS after the taxonomy work: 'Activewear'
-- and 'Footwear' each match two rows (a legacy top-level one holding nothing,
-- and a tree child holding live inventory). That is precisely why this maps to
-- category_id and not to a name — `where name = any(...)` cannot express which
-- one is meant.

create table public.pref_category_map (
  pref_id     text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (pref_id, category_id)
);

comment on table public.pref_category_map is
  'Maps buyer_profiles.preferred_categories ids (BUYER_CATEGORIES in src/lib/buyerCategories.ts) onto real categories.id. Single source of truth for preference -> category, read by buyer_cold_start_embedding and by the frontend.';

-- Reference data: world-readable, writable only by migration/service_role. No
-- policy grants INSERT/UPDATE/DELETE, so RLS denies those to anon/authenticated
-- by default while SECURITY DEFINER functions and service_role still pass.
alter table public.pref_category_map enable row level security;

create policy pref_category_map_read on public.pref_category_map
  for select to anon, authenticated using (true);

-- ── Seed ──
-- Resolved by (name, parent) rather than literal uuids so this reproduces on a
-- fresh database, same as 20260907140000.
insert into public.pref_category_map (pref_id, category_id)
select v.pref_id, c.id
from (values
  -- tshirts: the legacy 'T-shirts/Tops' bucket split three ways by gender.
  ('tshirts',    'Men''s T-Shirts'),
  ('tshirts',    'Unisex T-Shirts'),
  ('tshirts',    'Women''s Tops'),
  -- shirts: legacy 'Shirt'. Only a men's leaf exists; a women's shirt row does
  -- not, and inventing one here is out of scope for this prompt.
  ('shirts',     'Men''s Shirts'),
  -- dresses: legacy 'Dress' + 'Ethnic Wear'.
  ('dresses',    'Women''s Dresses'),
  ('dresses',    'Women''s Ethnic Wear'),
  -- bottomwear: legacy 'Trousers' + 'Jeans'.
  ('bottomwear', 'Men''s Jeans'),
  ('bottomwear', 'Men''s Pants/Trousers'),
  ('bottomwear', 'Women''s Pants/Trousers'),
  -- kidswear: legacy 'Kidswear' -> tree 'Kids Wear' (note the space).
  ('kidswear',   'Kids Wear'),
  -- activewear: legacy top-level 'Activewear' -> the A&H child of the same name
  -- added by 20260907130100. The legacy row still exists and holds nothing.
  ('activewear', 'Activewear'),
  -- accessories: legacy 'Footwear'. The 'Accessories' half is expanded below.
  ('accessories','Footwear')
) as v(pref_id, cat)
join public.categories c
  on c.name = v.cat
 and c.parent_id = (select id from public.categories
                     where name = 'Apparel & Home Categories' and parent_id is null)
on conflict do nothing;

-- accessories also covers the legacy top-level 'Accessories' bucket, whose tree
-- successor is the whole Fashion Accessories (Unisex) branch. Expanded as
-- "every child of" rather than listed, so a leaf added there later is included
-- automatically instead of silently dropping out of buyer preferences.
insert into public.pref_category_map (pref_id, category_id)
select 'accessories', c.id
from public.categories c
join public.categories par on par.id = c.parent_id
where par.name = 'Fashion Accessories (Unisex)' and par.parent_id is null
on conflict do nothing;

-- DELIBERATELY UNMAPPED, carried over from the TS map rather than invented away:
--   * coords  — no co-ord category exists in the tree. The one live co-ord
--                ('Gauze Co-ord Set') is filed under Women's Dresses.
--   * fabrics — no fabric category exists under Apparel & Home either.
-- Both map to nothing and contribute no products, exactly as the TS map's empty
-- arrays already did. A buyer whose ONLY preference is one of these falls
-- through to the popularity path, which is correct: we have no inventory
-- signal for them, and guessing a "nearest" category would be worse.
--
-- Also unmapped in the other direction: 'Winter Wear' and 'Home Textiles' hold
-- live products but correspond to no buyer preference id. Same as today —
-- PREF_CAT_KEYWORDS has no winter/home entry either.

grant select on public.pref_category_map to anon, authenticated;
