-- ─────────────────────────────────────────────────────────────
-- Role-gate the admin branch of the products / advertisements /
-- vendor_profiles WRITE policies, matching the pattern already applied to
-- vendor_subscriptions / subscription_invoices in the previous migration.
--
-- Only the admin half of each OR gains the role check. The vendor-owner
-- conditions are preserved verbatim:
--   * products / advertisements : vendor_id = auth.uid()
--     (advertisements INSERT keeps its extra `status <> 'active'` guard)
--   * vendor_profiles           : id = auth.uid()
--
-- Reads (products_select, advertisements_select, vprofiles_select) are left as
-- plain is_admin() — role-gating applies to writes only, support can see all.
--
-- This complements the column-level BEFORE triggers from the previous migration
-- (which gate WHICH column an owner/admin may change); here we gate WHICH admin
-- may write these tables' rows at all.
-- ─────────────────────────────────────────────────────────────

-- products -> super_admin / product_moderator
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to public
  with check (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'))
  );

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to public
  using (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'))
  )
  with check (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'))
  );

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to public
  using (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'))
  );

-- advertisements -> super_admin / ads_moderator
drop policy if exists advertisements_insert on public.advertisements;
create policy advertisements_insert on public.advertisements
  for insert to public
  with check (
    ((vendor_id = auth.uid()) and (status <> 'active'))
    or (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'))
  );

drop policy if exists advertisements_update on public.advertisements;
create policy advertisements_update on public.advertisements
  for update to public
  using (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'))
  )
  with check (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'))
  );

drop policy if exists advertisements_delete on public.advertisements;
create policy advertisements_delete on public.advertisements
  for delete to public
  using (
    (vendor_id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'))
  );

-- vendor_profiles -> super_admin / vendor_ops (single ALL policy)
drop policy if exists vprofiles_write on public.vendor_profiles;
create policy vprofiles_write on public.vendor_profiles
  for all to public
  using (
    (id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'))
  )
  with check (
    (id = auth.uid())
    or (public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops'))
  );
