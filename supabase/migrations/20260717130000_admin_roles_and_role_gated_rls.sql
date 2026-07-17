-- ─────────────────────────────────────────────────────────────
-- Admin RBAC: fine-grained admin roles layered on top of is_admin().
--
-- is_admin() / profiles.is_admin are UNCHANGED — they still mean "is this
-- person an admin at all". This adds a SECOND layer, admin_role(), so specific
-- WRITE actions can require a specific role instead of "any admin".
--
-- Enforcement necessarily lives in three places:
--   * RLS policies          — whole-row admin writes (subscriptions/invoices).
--   * BEFORE triggers        — COLUMN-level gates (products.status,
--                              vendor_profiles.is_verified/account_status,
--                              profiles.is_admin/admin_role). RLS cannot see
--                              "which column changed", so a trigger is the right
--                              tool. These triggers are SECURITY INVOKER on
--                              purpose: current_user then reveals whether the
--                              write is an authenticated client call
--                              ('authenticated' -> enforce) or a service-role /
--                              SECURITY DEFINER context (-> bypass; the RPC or
--                              service role does its own authorization).
--   * approve_vendor_content — the SECURITY DEFINER moderation RPC bypasses RLS,
--                              so its own is_admin() gate is tightened to require
--                              the product_moderator role.
--
-- Reads are left as plain is_admin() everywhere (support can SEE everything;
-- role-gating applies to writes only).
-- ─────────────────────────────────────────────────────────────


-- Part 1 — schema ----------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'admin_role_type' and n.nspname = 'public'
  ) then
    create type public.admin_role_type as enum (
      'super_admin', 'product_moderator', 'vendor_ops',
      'ads_moderator', 'finance_admin', 'support'
    );
  end if;
end $$;

-- Null = an is_admin user with no specific role yet. Left nullable on purpose:
-- such a user should FAIL CLOSED on role-gated writes, not error out.
alter table public.profiles
  add column if not exists admin_role public.admin_role_type;

-- Vendor suspension flag consumed by the admin panel (its Part 4). 'active' by
-- default; only vendor_ops may move it to 'suspended' (enforced below).
alter table public.vendor_profiles
  add column if not exists account_status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_profiles_account_status_chk') then
    alter table public.vendor_profiles
      add constraint vendor_profiles_account_status_chk
      check (account_status in ('active', 'suspended'));
  end if;
end $$;

-- admin_role(): the current user's admin role (or null). Mirrors is_admin().
create or replace function public.admin_role()
returns public.admin_role_type
language sql
stable
security definer
set search_path to 'public'
as $$
  select admin_role from public.profiles where id = auth.uid();
$$;

-- Bootstrap: promote the sole existing (seed) admin to super_admin. Without a
-- super_admin, role-gating deadlocks — no authenticated user could ever grant
-- the first role. Any additional super_admin must be granted out-of-band
-- (service role / SQL), which is exactly what this statement is.
update public.profiles
   set admin_role = 'super_admin'
 where id = '33333333-3333-3333-3333-333333333333'
   and is_admin = true
   and admin_role is null;


-- Part 2 — role-gated writes ----------------------------------------------

-- products.status: the moderation outcomes ('live','rejected') require a product
-- moderator. Vendors may still move their OWN product between draft/under_review
-- (submit / save-as-draft), but may never self-publish or self-reject.
create or replace function public.enforce_products_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;  -- service role / SECURITY DEFINER RPC: authorization done there
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'under_review')
       and not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      new.status := 'under_review';  -- clamp a client trying to insert live/rejected
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if auth.uid() = old.vendor_id then
      if new.status not in ('draft', 'under_review') then
        raise exception 'Vendors cannot set product status to %; moderation required', new.status
          using errcode = '42501';
      end if;
    elsif not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
      raise exception 'Product moderation requires the super_admin or product_moderator role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_moderation on public.products;
create trigger trg_products_moderation
  before insert or update on public.products
  for each row execute function public.enforce_products_moderation();


-- vendor_profiles.is_verified / account_status: verification and suspension are
-- admin actions gated on vendor_ops. Vendors edit the rest of their profile
-- freely; the two sensitive fields are clamped on insert and blocked on update.
create or replace function public.enforce_vendor_profile_admin_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
      new.is_verified    := false;
      new.account_status := 'active';
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.is_verified is distinct from old.is_verified
      or new.account_status is distinct from old.account_status)
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops')) then
    raise exception 'Changing vendor verification/account status requires the super_admin or vendor_ops role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vendor_profiles_admin_fields on public.vendor_profiles;
create trigger trg_vendor_profiles_admin_fields
  before insert or update on public.vendor_profiles
  for each row execute function public.enforce_vendor_profile_admin_fields();


-- advertisements moderation: an admin changing the status of an ad they do NOT
-- own (pause/reject) requires ads_moderator. Vendors keep full control of their
-- own ads' lifecycle (pause/resume) — those are owner writes, not moderation.
create or replace function public.enforce_ads_moderation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.status is distinct from old.status
     and auth.uid() is distinct from old.vendor_id
     and not (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator')) then
    raise exception 'Ad moderation requires the super_admin or ads_moderator role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ads_moderation on public.advertisements;
create trigger trg_ads_moderation
  before update on public.advertisements
  for each row execute function public.enforce_ads_moderation();


-- profiles.admin_role / is_admin: only a super_admin may grant, change, or
-- revoke admin status or admin roles. This is the keystone — if any admin could
-- assign roles, every gate above would be decorative. On insert the sensitive
-- fields are clamped for non-super-admins (no self-promotion at signup); the
-- first super_admin is bootstrapped out-of-band (see Part 1), which bypasses
-- this trigger via the current_user guard.
create or replace function public.enforce_admin_grants()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (public.is_admin() and public.admin_role() = 'super_admin') then
      new.is_admin   := false;
      new.admin_role := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.admin_role is distinct from old.admin_role
      or new.is_admin is distinct from old.is_admin)
     and not (public.is_admin() and public.admin_role() = 'super_admin') then
    raise exception 'Only a super_admin may change admin status or admin roles'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_admin_grants on public.profiles;
create trigger trg_profiles_admin_grants
  before insert or update on public.profiles
  for each row execute function public.enforce_admin_grants();


-- vendor_subscriptions / subscription_invoices: admin writes (plan changes,
-- cancellations, refund-status updates) require finance_admin. Reads stay open
-- to any admin via the existing *_select policies.
drop policy if exists vendor_subscriptions_admin on public.vendor_subscriptions;
create policy vendor_subscriptions_admin on public.vendor_subscriptions
  for all
  using (public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'))
  with check (public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'));

-- subscription_invoices had no admin write policy (writes went through service-
-- role edge functions). Add a finance_admin-gated one so the admin panel can
-- update refund status directly, without opening it to every admin.
drop policy if exists subscription_invoices_admin on public.subscription_invoices;
create policy subscription_invoices_admin on public.subscription_invoices
  for all
  using (public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'))
  with check (public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'));


-- Tighten the moderation RPC (SECURITY DEFINER, so it bypasses RLS entirely):
-- approving vendor content now requires product_moderator, not just any admin.
create or replace function public.approve_vendor_content(target uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator')) then
    raise exception 'not authorized: product moderation requires the product_moderator role';
  end if;
  update public.products       set status = 'live' where vendor_id = target and status = 'under_review';
  update public.product_videos set status = 'live' where vendor_id = target and status = 'under_review';
  update public.catalogues     set status = 'live' where vendor_id = target and status = 'under_review';
end;
$$;
