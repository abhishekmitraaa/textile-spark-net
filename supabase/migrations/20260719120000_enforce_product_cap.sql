-- ─────────────────────────────────────────────────────────────
-- Server-side enforcement of the subscription product_cap limit.
--
-- Until now product_cap (subscription_plans.limits->>'product_cap') was only
-- checked client-side in Upload.tsx, so a direct authenticated INSERT (skipping
-- the UI) could publish past the cap. This adds a DB-level BEFORE trigger on
-- `products` that counts the vendor's current LISTED products (under_review +
-- live — the same set get_vendor_plan() reports as products_used) against their
-- EFFECTIVE plan's cap and rejects a write that would exceed it.
--
-- Rules (mirrors the client gate + closes the edit/laundering path):
--   * A "listing slot" = a product with status under_review or live. Drafts
--     (and rejected) do not consume a slot, so draft inserts/edits are allowed.
--   * INSERT of an under_review/live product → blocked if the vendor already
--     has >= cap listed products.
--   * UPDATE that transitions a product INTO the counted set from outside it
--     (draft/rejected → under_review/live) → same check. This closes the
--     "save as draft, then flip to under_review" bypass that the client's
--     edit-mode path leaves open.
--   * UPDATE where the row was ALREADY counted (e.g. moderation flipping
--     under_review → live, or a normal edit of a live product) → always allowed;
--     it doesn't add occupancy.
--   * product_cap = -1 (VIP) → unlimited, never blocks.
--
-- Effective plan resolution copies get_vendor_plan()'s expiry rule: an active
-- vendor_subscriptions row whose current_period_end is in the future gives its
-- plan; otherwise the vendor falls back to Free (cap 2).
--
-- SECURITY INVOKER (like enforce_products_moderation): the function runs as the
-- calling role, so `current_user = 'authenticated'` distinguishes real end-user
-- writes (enforced) from service-role / SECURITY DEFINER admin paths — seeds,
-- approve_vendor_content — which bypass, exactly like the moderation trigger.
-- Under RLS the caller can already read their own subscription (owner read) and
-- all of their own products (products_select: vendor_id = auth.uid()), so the
-- count is accurate without elevated privileges.
--
-- Existing over-cap vendors (seeded before enforcement) are NOT touched: the
-- trigger only rejects NEW occupancy, so their current listings stay live but
-- they cannot add more until under the cap. Forward-looking, non-destructive.
-- ─────────────────────────────────────────────────────────────

create or replace function public.enforce_product_cap()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  cap        integer;
  used       integer;
  eff_plan   text := 'free';
  sub_plan   text;
  sub_status text;
  sub_end    timestamptz;
  adds_slot  boolean;
begin
  -- Only enforce for real end-user (PostgREST 'authenticated') writes. Service
  -- role and SECURITY DEFINER contexts (seeds, admin RPCs) bypass — matching
  -- enforce_products_moderation().
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Does this write newly occupy a listing slot?
  if tg_op = 'INSERT' then
    adds_slot := new.status::text in ('under_review', 'live');
  else -- UPDATE: only a transition INTO the counted set from outside it counts.
    adds_slot := new.status::text in ('under_review', 'live')
                 and coalesce(old.status::text, '') not in ('under_review', 'live');
  end if;

  if not adds_slot then
    return new;
  end if;

  -- Effective plan (mirror get_vendor_plan's expiry rule).
  select vs.plan_id, vs.status, vs.current_period_end
    into sub_plan, sub_status, sub_end
    from public.vendor_subscriptions vs
   where vs.vendor_id = new.vendor_id;

  if sub_plan is not null and sub_status = 'active'
     and sub_end is not null and sub_end > now() then
    eff_plan := sub_plan;
  end if;

  select coalesce((limits->>'product_cap')::int, -1)
    into cap
    from public.subscription_plans
   where id = eff_plan;

  cap := coalesce(cap, -1);

  -- Negative cap = unlimited.
  if cap < 0 then
    return new;
  end if;

  -- Current occupancy, excluding this row (harmless on INSERT — the row isn't
  -- in the table yet).
  select count(*)
    into used
    from public.products
   where vendor_id = new.vendor_id
     and status::text in ('under_review', 'live')
     and id <> new.id;

  if used >= cap then
    raise exception
      'Product limit reached: your % plan allows % listed product(s); you already have %. Upgrade your plan or remove a listing.',
      eff_plan, cap, used
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_products_cap on public.products;
create trigger trg_products_cap
  before insert or update on public.products
  for each row execute function public.enforce_product_cap();
