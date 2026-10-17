-- ─────────────────────────────────────────────────────────────────────────────
-- Garments with sizing of their own (2026-10-17)
--
-- Mitra: "size charts are still not correct for all types of items: a bra has S, M… and not the size chart
-- normally used". A bra, panty, saree, lehenga, petticoat, men's innerwear or men's ethnic wear had no
-- sub-category in the vendor upload list, so it went under Activewear, Women's Tops or "Other", with letter
-- sizes or free text; all footwear shared one free-text field. The app now has these sub-categories with
-- their own size sets and buyer charts (src/data/sellerCategories.ts, src/data/sizeCharts.ts). A listing's
-- category_id is found by name under its parent (resolveSubcategoryId), so each needs its row here.
--
-- Additive: new rows only, nothing renamed or moved. Existing listings keep their category and sizes.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_parent uuid;
begin
  select id into v_parent from public.categories where name = 'Apparel & Home Categories' and parent_id is null;
  if v_parent is null then
    raise exception 'The "Apparel & Home Categories" parent row is missing';
  end if;

  insert into public.categories (name, grp, parent_id)
  select n, 'Apparel & Home Categories', v_parent
    from unnest(array[
      'Bras', 'Briefs & Panties', 'Lingerie Sets', 'Shapewear', 'Nightwear & Loungewear', 'Sarees', 'Lehengas',
      'Petticoats', 'Men''s Innerwear', 'Men''s Ethnic Wear', 'Men''s Footwear', 'Women''s Footwear', 'Kids'' Footwear'
    ]) as n
   where not exists (select 1 from public.categories c where c.name = n and c.parent_id = v_parent);

  if (select count(*) from public.categories c
       where c.parent_id = v_parent
         and c.name in ('Bras', 'Briefs & Panties', 'Lingerie Sets', 'Shapewear', 'Nightwear & Loungewear', 'Sarees',
                        'Lehengas', 'Petticoats', 'Men''s Innerwear', 'Men''s Ethnic Wear', 'Men''s Footwear',
                        'Women''s Footwear', 'Kids'' Footwear')) <> 13 then
    raise exception 'self-check: the 13 garment sub-categories are not all there';
  end if;
end $$;
