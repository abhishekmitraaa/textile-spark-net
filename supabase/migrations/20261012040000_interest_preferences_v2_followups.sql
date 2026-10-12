-- Interest Preference v2, follow-ups from the code reviews (2026-10-12).
--
--   1. buyer_cold_start_embedding() averages each live product once. Since v2
--      (20261010232412) a category can sit under two interests (Woven Fabrics
--      under Fabrics and Raw Materials; Fashion Designing, PR & Media and
--      Photography & Videography under Freelance too), and the old join counted
--      such a product once per interest covering it. Same signature, same
--      attributes, same grants (create or replace keeps them); same NULL when
--      nothing matches.
--   2. The old interest ids are translated on every write. A browser still
--      running the pre-v2 app saves them; the app translated only on read, so a
--      buyer who never edited again kept them. The translation table lives once,
--      in interest_ids_translate(), which the trigger, the backfill and the
--      self-check all call. Same table as LEGACY_INTEREST_IDS
--      (src/lib/buyerCategories.ts) and the v2 migration.
--   3. "Others" is kept only with words. For You saves a tap at once, so a tap
--      on Others followed by a reload used to leave a bare "Others" saved; the
--      words trigger now drops 'others' when there are no words, the rule the
--      Interest Preference screen already applies on Save.

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

-- Pure: ids in, ids out. Executable by everyone (the default), because the
-- trigger below runs as the buyer who writes the row and calls it.
create or replace function public.interest_ids_translate(p_ids text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(
    select x.pref
    from (
      select distinct on (coalesce(m.new_id, u.old))
             coalesce(m.new_id, u.old) as pref,
             u.ord * 10 + coalesce(m.sub, 0) as pos
      from unnest(p_ids) with ordinality as u(old, ord)
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
  ), '{}'::text[]);
$$;

comment on function public.interest_ids_translate(text[]) is
  'Buyer interest ids in today''s vocabulary: the pre-2026-10-11 ids (tshirts, shirts, coords, dresses, bottomwear, activewear) translated by what they covered, order kept, duplicates dropped. The one SQL copy of LEGACY_INTEREST_IDS in src/lib/buyerCategories.ts.';

create or replace function public.buyer_profiles_interest_ids_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.preferred_categories is not null then
    new.preferred_categories := public.interest_ids_translate(new.preferred_categories);
  end if;
  return new;
end;
$$;

revoke all on function public.buyer_profiles_interest_ids_tidy() from public, anon, authenticated;

-- Named to sort before trg_buyer_profiles_interest_other: triggers on one
-- event fire in name order, and the words trigger reads the translated list.
create trigger trg_buyer_profiles_interest_ids
  before insert or update of preferred_categories on public.buyer_profiles
  for each row execute function public.buyer_profiles_interest_ids_tidy();

-- ── 3. "Others" only with words ──

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
  elsif new.preferred_interest_other is null then
    -- A bare "Others" says nothing: keep it only with words.
    new.preferred_categories := array_remove(new.preferred_categories, 'others');
  end if;
  return new;
end;
$$;

-- ── Rows to bring up to date ──

-- Saved with old ids since v2, or a bare "Others": the triggers fix both.
update public.buyer_profiles
   set preferred_categories = preferred_categories
 where preferred_categories is distinct from public.interest_ids_translate(preferred_categories)
    or ('others' = any(preferred_categories) and preferred_interest_other is null);

-- ── Self-check ──

do $$
begin
  if exists (select 1 from public.buyer_profiles
             where preferred_categories is distinct from public.interest_ids_translate(preferred_categories)) then
    raise exception 'interest_preferences_v2_followups: profiles still hold old ids';
  end if;
  if exists (select 1 from public.buyer_profiles
             where 'others' = any(preferred_categories) and preferred_interest_other is null) then
    raise exception 'interest_preferences_v2_followups: a bare "Others" is still saved';
  end if;
  if public.interest_ids_translate('{tshirts,fabrics,coords}') is distinct from '{mens-clothing,womens-clothing,unisex-clothing,fabrics}'::text[] then
    raise exception 'interest_preferences_v2_followups: interest_ids_translate is wrong';
  end if;
  if has_function_privilege('anon', 'public.buyer_cold_start_embedding(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.buyer_cold_start_embedding(uuid)', 'execute') then
    raise exception 'interest_preferences_v2_followups: buyer_cold_start_embedding is callable by clients';
  end if;
end;
$$;
