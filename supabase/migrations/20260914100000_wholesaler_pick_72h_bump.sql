-- ─────────────────────────────────────────────────────────────────────────────
-- WHOLESALER PICK — the 72-hour bump, built for real.
--
-- `wholesalerPick` is sold at ₹59 as "72-hour guaranteed exposure with bumps".
-- Nothing enforced the window and nothing performed a bump: the campaign was
-- ordered by `created_at desc, id desc` exactly like every other campaign, so it
-- sank as newer campaigns arrived and the vendor got nothing they paid for.
--
-- Proven live before this migration, against the Trends slot
-- (featuredProduct + wholesalerPick):
--     1  Formal Blazer - Navy        (featuredProduct)
--     2  Slim Fit Stretch Jeans      (featuredProduct)
--     3  Quilted Puffer Jacket       (wholesalerPick)  <- paid, still in window
--     4  Oversized Graphic Tee       (featuredProduct)
--     5  Floral Wrap Midi Dress      (featuredProduct)
--
-- ── WHAT "BUMP" IS TAKEN TO MEAN, PRECISELY ──
--
-- For 72 hours from `starts_at`, a wholesalerPick campaign is ordered AHEAD of
-- every non-bumped campaign in whatever slot it appears in. It does not sink as
-- newer campaigns arrive; that non-sinking IS the bump. After the window it
-- returns to ordinary recency ordering and keeps running until `ends_at`.
--
-- The alternative reading — short periodic bursts to the top, several times
-- across the 72 hours — was rejected: it delivers strictly less exposure for the
-- same price, it is far harder to verify (a query would have to be run at the
-- right instant to see it), and nothing in the product copy asks for it. The
-- design spec the v4 brief refers to (claude/buyer-ad-placement-design-spec.md)
-- does not exist in either repo, so its "Bumped" tag convention could not be
-- followed; the buyer-facing indicator is implemented as a small "Bumped" chip
-- on the ad card instead, and the wording is easy to change.
--
-- CONSEQUENCE WORTH STATING: in a mixed slot, a bumped Wholesaler Pick outranks
-- Featured Product campaigns for those 72 hours. That is what wholesalerPick
-- buys, and it is why it costs more than a day of Featured Product — but it
-- does mean Featured Product vendors are pushed down while a bump is live.
--
-- Additive: no column or table changes. `active_ads` is DROPPED and recreated
-- rather than CREATE OR REPLACE'd, because its return table gains a column and
-- `create or replace` cannot change a function's output type — it would either
-- error or, with a changed signature, create a silent OVERLOAD (the 42725 trap
-- that took `match_products` down once already in this project).
-- ─────────────────────────────────────────────────────────────────────────────

-- How long the bump lasts. A function, not a literal in three places.
create or replace function public.ad_bump_window()
returns interval
language sql
immutable
as $$ select interval '72 hours' $$;

comment on function public.ad_bump_window() is
  'Length of the wholesalerPick guaranteed-exposure window, measured from starts_at.';

-- Is this campaign inside its paid bump window right now?
--
-- Takes the row type so it can be used as a computed column and inside
-- active_ads without re-reading the table. STABLE, not IMMUTABLE: it reads
-- now().
create or replace function public.ad_is_bumped(a public.advertisements)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    exists (
      select 1 from unnest(string_to_array(replace(coalesce(a.placement, ''), ' ', ''), ',')) p
       where p = 'wholesalerPick'
    )
    and a.starts_at is not null
    and now() >= a.starts_at
    and now() <  a.starts_at + public.ad_bump_window(),
    false);
$$;

comment on function public.ad_is_bumped(public.advertisements) is
  'True while a wholesalerPick campaign is inside its 72-hour guaranteed-exposure window. Ordered first by active_ads() for that period.';

-- ── active_ads: bump-first ordering + an is_bumped flag for the UI ──────────
drop function if exists public.active_ads(integer, uuid, text[], uuid[]);

create function public.active_ads(
  max_count integer default 12,
  filter_category uuid default null,
  filter_placements text[] default null,
  filter_categories uuid[] default null
)
returns table(
  ad_id uuid, product_id uuid, title text, placement text,
  product_name text, price_value numeric, currency text, image_url text,
  vendor_id uuid, vendor_name text, category_name text,
  is_bumped boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.id, a.product_id, a.title, a.placement,
         p.name, p.price_value, p.currency,
         coalesce(a.image_url, (select url from public.product_images pi
                                 where pi.product_id = p.id order by position limit 1)),
         a.vendor_id, vp.brand_name,
         c.name,
         public.ad_is_bumped(a)
  from public.advertisements a
  join public.products p on p.id = a.product_id and p.status = 'live'
  left join public.vendor_profiles vp on vp.id = a.vendor_id
  left join public.categories c on c.id = p.category_id
  where public.is_ad_eligible(
          a,
          nullif(array_remove(
            coalesce(filter_categories, array[]::uuid[]) || filter_category,
            null), array[]::uuid[]),
          public.ad_viewer_city())
    and (
      filter_placements is null
      or exists (
        select 1 from unnest(filter_placements) fp
        where (',' || replace(coalesce(a.placement, ''), ' ', '') || ',')
              like ('%,' || fp || ',%')
      )
    )
  -- Bumped campaigns first, then the existing total ordering unchanged. The
  -- `id desc` tiebreaker stays: without it two campaigns created in the same
  -- millisecond could swap places between fetches, which would break the
  -- disjoint-block slicing the repeating ad slots rely on.
  order by public.ad_is_bumped(a) desc, a.created_at desc, a.id desc
  limit greatest(1, max_count);
$$;

-- Re-grant: DROP took the old grants with it. anon must keep EXECUTE — signed-out
-- buyers are served ads too, and losing this would silently empty every rail.
revoke all on function public.active_ads(integer, uuid, text[], uuid[]) from public;
grant execute on function public.active_ads(integer, uuid, text[], uuid[]) to anon, authenticated, service_role;

-- ad_is_bumped / ad_bump_window are called from inside a SECURITY DEFINER
-- function owned by postgres, so clients never need to call them directly.
revoke all on function public.ad_is_bumped(public.advertisements) from public, anon, authenticated;
revoke all on function public.ad_bump_window() from public, anon, authenticated;
