-- Interest Preference v2 (Mitra, 2026-10-11).
--
-- The buyer's interest screen moved from nine clothing types to the seventeen
-- interests of the new design, plus "Others" with the buyer's own words. Three
-- places ask it (registration, the profile's Edit, For You), all through
-- src/components/buyer/CategoryPickerGrid.tsx; the ids are in
-- src/lib/buyerCategories.ts.
--
--   1. buyer_profiles.preferred_interest_other: the "Others" words. Tidied by a
--      trigger and kept only while 'others' is in preferred_categories, so
--      anonymize_account() (which empties preferred_categories) clears it too.
--   2. pref_category_map rows for the new ids, resolved by (parent, name) the
--      same way 20260907160000 did, so this reproduces on a fresh database.
--      fabrics, accessories and kidswear keep their ids. The old ids' rows stay
--      for now: a browser still running the old app can save them (ToDo:
--      remove once no saved row or live bundle uses them).
--   3. Saved picks translated once to the new ids, by what each old id covered
--      (Mitra chose "carry them over"). Same table as LEGACY_INTEREST_IDS.
--
-- Decisions: "Exporter" covers the two import/export categories that exist
-- (Mitra). "Others" maps to nothing: it narrows no feed.

-- ── 1. The "Others" words ──

alter table public.buyer_profiles
  add column preferred_interest_other text
  constraint buyer_profiles_interest_other_len
    check (preferred_interest_other is null or char_length(preferred_interest_other) between 1 and 60);

comment on column public.buyer_profiles.preferred_interest_other is
  'The buyer''s own words for the "Others" interest. Null unless preferred_categories contains ''others''; written by the buyer, shown only to them, never translated.';

-- buyer_profiles has column grants, so a new column needs its own. Signed-out
-- callers get nothing: no policy lets them read or write a row.
grant select (preferred_interest_other),
      insert (preferred_interest_other),
      update (preferred_interest_other)
  on public.buyer_profiles to authenticated;

create or replace function public.buyer_profiles_interest_other_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preferred_interest_other is not null then
    -- Control characters out, runs of space folded, ends trimmed, '' -> null.
    new.preferred_interest_other := nullif(btrim(regexp_replace(
      regexp_replace(new.preferred_interest_other, '[[:cntrl:]]', ' ', 'g'),
      '[[:space:]]+', ' ', 'g')), '');
  end if;
  if not ('others' = any(coalesce(new.preferred_categories, '{}'::text[]))) then
    new.preferred_interest_other := null;
  end if;
  return new;
end;
$$;

revoke all on function public.buyer_profiles_interest_other_tidy() from public, anon, authenticated;

create trigger trg_buyer_profiles_interest_other
  before insert or update on public.buyer_profiles
  for each row execute function public.buyer_profiles_interest_other_tidy();

-- ── 2. What each new interest means ──

-- Single categories, by (top-level family, child). Families are matched by a
-- prefix where the name carries punctuation ("Raw Materials – Fabrics &
-- Inputs" has an en dash).
insert into public.pref_category_map (pref_id, category_id)
select v.pref_id, c.id
from (values
  ('fabrics',          'Raw Materials%',                       'Woven Fabrics'),
  ('fabrics',          'Raw Materials%',                       'Knitted Fabrics'),
  ('fabrics',          'Raw Materials%',                       'Denim'),
  ('fabrics',          'Raw Materials%',                       'Sustainable Fabrics'),
  ('fabrics',          'Raw Materials%',                       'Terry & Fleece'),
  ('womens-clothing',  'Apparel & Home Categories',            'Women''s Dresses'),
  ('womens-clothing',  'Apparel & Home Categories',            'Women''s Ethnic Wear'),
  ('womens-clothing',  'Apparel & Home Categories',            'Women''s Tops'),
  ('womens-clothing',  'Apparel & Home Categories',            'Women''s Pants/Trousers'),
  ('mens-clothing',    'Apparel & Home Categories',            'Men''s T-Shirts'),
  ('mens-clothing',    'Apparel & Home Categories',            'Men''s Shirts'),
  ('mens-clothing',    'Apparel & Home Categories',            'Men''s Jeans'),
  ('mens-clothing',    'Apparel & Home Categories',            'Men''s Pants/Trousers'),
  ('unisex-clothing',  'Apparel & Home Categories',            'Unisex T-Shirts'),
  ('unisex-clothing',  'Apparel & Home Categories',            'Activewear'),
  ('unisex-clothing',  'Apparel & Home Categories',            'Winter Wear'),
  ('unisex-clothing',  'Apparel & Home Categories',            'Other Ready-made Garments'),
  ('fashion-designer', 'Freelancers & Job Workers',            'Fashion Designing'),
  ('fashion-designer', 'Freelancers & Job Workers',            'Tech Pack Creation'),
  ('fashion-designer', 'Freelancers & Job Workers',            'Trend Forecasting'),
  ('fashion-designer', 'Service Providers%',                   'Fashion Designing'),
  ('fashion-designer', 'Service Providers%',                   'Tech Pack Development'),
  ('fashion-designer', 'Service Providers%',                   'Pattern Making / CAD'),
  ('marketing-pr',     'Freelancers & Job Workers',            'Marketing Strategy'),
  ('marketing-pr',     'Freelancers & Job Workers',            'PR & Media'),
  ('marketing-pr',     'Freelancers & Job Workers',            'Performance & Influencer Marketing'),
  ('marketing-pr',     'Freelancers & Job Workers',            'Brand Strategy Consulting'),
  ('marketing-pr',     'Freelancers & Job Workers',            'SEO & Copywriting'),
  ('photography',      'Marketing, PR & Photography',          'Photography & Videography'),
  ('photography',      'Freelancers & Job Workers',            'Photography & Videography'),
  ('photography',      'Freelancers & Job Workers',            'Reels & Campaign Shoots'),
  ('exporter',         'Logistics & Supply Chain',             'Import / Export Handling'),
  ('exporter',         'Finance & Compliance Services',        'Import / Export Compliance')
) as v(pref_id, family, child)
join public.categories par on par.parent_id is null and par.name like v.family
join public.categories c on c.parent_id = par.id and c.name = v.child
on conflict do nothing;

-- Whole families: every child, so a category added there later is included
-- without another migration.
insert into public.pref_category_map (pref_id, category_id)
select v.pref_id, c.id
from (values
  ('cosmetics',         'Cosmetics & Beauty'),
  ('labels-tags',       'Labels & Tags'),
  ('it-software',       'IT, Software & SaaS'),
  ('raw-materials',     'Raw Materials%'),
  ('raw-materials',     'Chemicals & Dyes'),
  ('packaging',         'Packaging'),
  ('trims-accessories', 'Trims & Accessories'),
  ('freelancers',       'Freelancers & Job Workers'),
  ('marketing-pr',      'Marketing, PR & Photography')
) as v(pref_id, family)
join public.categories par on par.parent_id is null and par.name like v.family
join public.categories c on c.parent_id = par.id
-- Photography is its own interest, so it stays out of Marketing & PR.
where not (v.pref_id = 'marketing-pr' and c.name = 'Photography & Videography')
on conflict do nothing;

-- ── 3. Saved picks, in the new words ──

update public.buyer_profiles b
   set preferred_categories = t.ids
  from (
    select b2.id,
           array(
             select x.pref
             from (
               select distinct on (coalesce(m.new_id, u.old))
                      coalesce(m.new_id, u.old) as pref,
                      u.ord * 10 + coalesce(m.sub, 0) as pos
               from unnest(b2.preferred_categories) with ordinality as u(old, ord)
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
           ) as ids
    from public.buyer_profiles b2
    where b2.preferred_categories && array['tshirts', 'shirts', 'coords', 'dresses', 'bottomwear', 'activewear']
  ) t
 where b.id = t.id;

-- ── Self-check ──

do $$
declare
  missing text;
  left_over int;
begin
  select string_agg(p, ', ') into missing
  from unnest(array['fabrics', 'womens-clothing', 'mens-clothing', 'cosmetics', 'unisex-clothing',
                    'kidswear', 'accessories', 'labels-tags', 'it-software', 'raw-materials',
                    'packaging', 'trims-accessories', 'fashion-designer', 'marketing-pr',
                    'freelancers', 'exporter', 'photography']) as p
  where not exists (select 1 from public.pref_category_map m where m.pref_id = p);
  if missing is not null then
    raise exception 'interest_preferences_v2: no categories for %', missing;
  end if;

  select count(*) into left_over from public.buyer_profiles
  where preferred_categories && array['tshirts', 'shirts', 'coords', 'dresses', 'bottomwear', 'activewear'];
  if left_over > 0 then
    raise exception 'interest_preferences_v2: % profiles still hold old ids', left_over;
  end if;

  if exists (select 1 from public.pref_category_map m
             join public.categories c on c.id = m.category_id
             where m.pref_id = 'marketing-pr' and c.name = 'Photography & Videography') then
    raise exception 'interest_preferences_v2: photography still inside marketing-pr';
  end if;
end;
$$;
