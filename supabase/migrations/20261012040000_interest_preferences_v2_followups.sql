-- Interest Preference v2, follow-ups from the code review (2026-10-12).
--
--   1. buyer_cold_start_embedding() averages each live product once. Since v2
--      (20261010232412) a category can sit under two interests (Woven Fabrics
--      under Fabrics and Raw Materials; Fashion Designing, PR & Media and
--      Photography & Videography under Freelance too), and the old join counted
--      such a product once per interest covering it. Same signature, same
--      attributes, same grants (create or replace keeps them); same NULL when
--      nothing matches.
--   2. The old interest ids are translated on every write, by the table the v2
--      migration used once. A browser still running the pre-v2 app saves them;
--      the app translated only on read, so a buyer who never edited again kept
--      them and the old ids' map rows could never be retired (todo.md).
--      Then the rows written with old ids since v2 are translated.

-- ── 1. Starting feed: each product once ──

create or replace function public.buyer_cold_start_embedding(p_buyer_id uuid)
returns extensions.halfvec
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select avg(pr.embedding)::extensions.halfvec(1536)
  from public.products pr
  where pr.status = 'live'
    and pr.embedding is not null
    and pr.category_id in (
      select m.category_id
      from public.buyer_profiles bp
      cross join lateral unnest(bp.preferred_categories) as pref(pref_id)
      join public.pref_category_map m on m.pref_id = pref.pref_id
      where bp.id = p_buyer_id
    );
$function$;

comment on function public.buyer_cold_start_embedding(uuid) is
  'Centroid of live products in the buyer''s onboarding-selected categories, resolved through pref_category_map, each product counted once however many interests cover it. NULL when the buyer set no preferences, or none of them map to a category holding an embedded live product.';

-- ── 2. Old ids, translated on write ──

create or replace function public.buyer_profiles_interest_ids_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Same table as LEGACY_INTEREST_IDS (src/lib/buyerCategories.ts) and the v2
  -- migration: by what each old id covered. Order kept, duplicates dropped.
  if new.preferred_categories && array['tshirts', 'shirts', 'coords', 'dresses', 'bottomwear', 'activewear'] then
    new.preferred_categories := array(
      select x.pref
      from (
        select distinct on (coalesce(m.new_id, u.old))
               coalesce(m.new_id, u.old) as pref,
               u.ord * 10 + coalesce(m.sub, 0) as pos
        from unnest(new.preferred_categories) with ordinality as u(old, ord)
        left join (values
          ('tshirts',    'mens-clothing',   1),
          ('tshirts',    'womens-clothing', 2),
          ('tshirts',    'unisex-clothing', 3),
          ('shirts',     'mens-clothing',   1),
          ('coords',     'womens-clothing', 1),
          ('dresses',    'womens-clothing', 1),
          ('bottomwear', 'mens-clothing',   1),
          ('bottomwear', 'womens-clothing', 2),
          ('activewear', 'unisex-clothing', 1)
        ) as m(old_id, new_id, sub) on m.old_id = u.old
        order by coalesce(m.new_id, u.old), u.ord * 10 + coalesce(m.sub, 0)
      ) x
      order by x.pos
    );
  end if;
  return new;
end;
$$;

revoke all on function public.buyer_profiles_interest_ids_tidy() from public, anon, authenticated;

-- Named to sort before trg_buyer_profiles_interest_other: triggers on one
-- event fire in name order, and the words tidy reads the translated list.
create trigger trg_buyer_profiles_interest_ids
  before insert or update of preferred_categories on public.buyer_profiles
  for each row execute function public.buyer_profiles_interest_ids_tidy();

-- Rows saved with old ids since v2: the trigger translates them.
update public.buyer_profiles
   set preferred_categories = preferred_categories
 where preferred_categories && array['tshirts', 'shirts', 'coords', 'dresses', 'bottomwear', 'activewear'];

-- ── Self-check ──

do $$
begin
  if exists (select 1 from public.buyer_profiles
             where preferred_categories && array['tshirts', 'shirts', 'coords', 'dresses', 'bottomwear', 'activewear']) then
    raise exception 'interest_preferences_v2_followups: profiles still hold old ids';
  end if;
  if has_function_privilege('anon', 'public.buyer_cold_start_embedding(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.buyer_cold_start_embedding(uuid)', 'execute') then
    raise exception 'interest_preferences_v2_followups: buyer_cold_start_embedding is callable by clients';
  end if;
end;
$$;
