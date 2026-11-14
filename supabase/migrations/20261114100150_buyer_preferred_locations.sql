-- For You's "Where do you prefer to source from?" is kept on the account (buyer sign-up audit 2026-11-13, Low item 4).
--
-- It lived only in the browser (localStorage), so a buyer's answer was gone on another device or after clearing the
-- browser, while their interests followed them. `preferred_locations` holds the For You location ids (`LOCATIONS` in
-- src/pages/ForYou.tsx: "tiruppur", "surat", …, "nopreference"), written by preferencesStore with the interests.
-- At most 30 short ids; the column is the buyer's own row, like `preferred_categories`.

alter table public.buyer_profiles
  add column if not exists preferred_locations text[] not null default '{}';

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'buyer_profiles_preferred_locations_check') then
    alter table public.buyer_profiles
      add constraint buyer_profiles_preferred_locations_check check (
        cardinality(preferred_locations) <= 30
        and public.immutable_array_to_string(preferred_locations, ',') ~ '^[a-z0-9-]{1,40}(,[a-z0-9-]{1,40})*$|^$');
  end if;
end
$c$;

do $check$
begin
  if not has_column_privilege('authenticated', 'public.buyer_profiles', 'preferred_locations', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.buyer_profiles', 'preferred_locations', 'SELECT') then
    raise exception 'self-check: buyers cannot read or write their preferred_locations';
  end if;
end
$check$;
