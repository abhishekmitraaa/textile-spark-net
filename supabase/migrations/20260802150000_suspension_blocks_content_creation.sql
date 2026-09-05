-- ─────────────────────────────────────────────────────────────
-- Phase D — a suspended account can no longer create content.
--
-- SIGNED OFF before writing. Until now `profiles.account_status = 'suspended'`
-- stopped exactly two things: sending a message (messages_insert) and placing a
-- call (callGate). A suspended account could still post RFQs, submit quotes,
-- upload products and videos, create ads, and write reviews.
--
-- This is its OWN migration, separate from the moderation work, and it is
-- independently revertable: every statement below restores a named policy to a
-- form that differs from the current one only by the added conjunct, so
-- reverting is re-running the previous definition.
--
-- ── What this does NOT do, stated plainly ──
--
-- These are INSERT policies. Gating them stops a suspended account CREATING
-- something new. It does not:
--
--   * take down content that is already live. A suspended vendor's existing
--     products, videos and reviews stay visible to buyers.
--   * stop a RUNNING ad campaign. `advertisements` is activated by an UPDATE
--     after payment, not by the INSERT (advertisements_insert even requires
--     `status <> 'active'`), so a campaign that is already live keeps serving.
--     Killing a live paid campaign as a side effect of a chat suspension is a
--     bigger and more expensive decision than this one, and it is deliberately
--     not taken here.
--   * end an in-progress session. There is no session-revocation step.
--
-- Hiding existing content and stopping live campaigns are separate changes to
-- SELECT policies and to the ad activation path. Do not read this migration as
-- having delivered them.
--
-- ── Why a function and not `(select account_status ...) = 'active'` inline ──
--
-- messages_insert inlines that subquery, which was correct for one policy. At
-- eight policies it becomes eight places to get the enum comparison wrong, and
-- `profiles_select` being `true` is doing quiet work there — a helper that is
-- SECURITY DEFINER does not depend on the caller being able to read the row at
-- all, which is the property you want when the row belongs to the caller and
-- the caller is suspended.
--
-- STABLE, not VOLATILE: the planner may cache it within a statement, which is
-- what keeps a bulk insert from re-reading profiles per row.
-- ─────────────────────────────────────────────────────────────

create or replace function public.account_is_active(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $BODY$
  -- coalesce to FALSE, not TRUE. A missing profiles row means "unknown", and a
  -- content-creation gate must fail closed. (auth.uid() is null for an
  -- unauthenticated caller, which every policy below already rejects on its own
  -- ownership check — this is the second lock, not the first.)
  select coalesce((select account_status = 'active' from public.profiles where id = p_id), false);
$BODY$;

grant execute on function public.account_is_active(uuid) to authenticated, service_role, anon;


-- ── Buyer-side creation ─────────────────────────────────────────────────────

drop policy if exists rfqs_insert on public.rfqs;
create policy rfqs_insert on public.rfqs
  for insert with check (
    buyer_id = auth.uid()
    and public.account_is_active(auth.uid())
  );

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert with check (
    buyer_id = auth.uid()
    and public.account_is_active(auth.uid())
  );

drop policy if exists product_reviews_insert_own on public.product_reviews;
create policy product_reviews_insert_own on public.product_reviews
  for insert with check (
    buyer_id = auth.uid()
    and public.account_is_active(auth.uid())
  );

drop policy if exists service_reviews_insert_own on public.service_reviews;
create policy service_reviews_insert_own on public.service_reviews
  for insert with check (
    buyer_id = auth.uid()
    and public.account_is_active(auth.uid())
  );


-- ── Vendor-side creation ────────────────────────────────────────────────────

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
  for insert with check (
    vendor_id = auth.uid()
    and public.account_is_active(auth.uid())
  );

-- The admin branch is inside the conjunct on purpose: an admin acting on behalf
-- of a vendor is still acting as themselves, and a suspended admin should not be
-- creating content either. Keeping the gate at the top level would say the same
-- thing; keeping it here keeps the shape of the original policy readable.
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert with check (
    public.account_is_active(auth.uid())
    and (
      vendor_id = auth.uid()
      or (public.is_admin() and public.admin_role() in ('super_admin', 'product_moderator'))
    )
  );

drop policy if exists advertisements_insert on public.advertisements;
create policy advertisements_insert on public.advertisements
  for insert with check (
    public.account_is_active(auth.uid())
    and (
      (vendor_id = auth.uid() and status <> 'active')
      or (public.is_admin() and public.admin_role() in ('super_admin', 'ads_moderator'))
    )
  );


-- ── product_videos: split the FOR ALL policy ────────────────────────────────
--
-- `pvideos_write` is FOR ALL, so adding the gate to it would also stop a
-- suspended vendor EDITING OR DELETING their existing videos. That is not what
-- was signed off, and it is the wrong behaviour anyway: taking down your own
-- content is not content creation, and a suspended vendor who wants to remove
-- something should be able to.
--
-- Split into three policies with identical predicates to before, and the gate on
-- INSERT only. Reverting means recreating pvideos_write and dropping these.
drop policy if exists pvideos_write on public.product_videos;

create policy pvideos_insert on public.product_videos
  for insert with check (
    public.account_is_active(auth.uid())
    and (vendor_id = auth.uid() or public.is_admin())
  );

create policy pvideos_update on public.product_videos
  for update using (vendor_id = auth.uid() or public.is_admin())
          with check (vendor_id = auth.uid() or public.is_admin());

create policy pvideos_delete on public.product_videos
  for delete using (vendor_id = auth.uid() or public.is_admin());


-- ── Prove the gate is wired the way it reads ────────────────────────────────
do $BODY$
declare
  v_missing text;
begin
  select string_agg(t, ', ') into v_missing
    from unnest(array[
      'rfqs', 'quotes', 'products', 'product_videos',
      'advertisements', 'reviews', 'product_reviews', 'service_reviews'
    ]) as t
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename  = t
        and p.cmd        = 'INSERT'
        and p.with_check like '%account_is_active%'
   );

  if v_missing is not null then
    raise exception 'Phase D gate missing on: %', v_missing;
  end if;
end $BODY$;
