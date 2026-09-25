-- MPF-7, part 3 (Phase 16 of the My Profile brief, 2026-09-24): a deleted
-- account's stale access token can't write.
--
-- anonymize_account() ends the account's sessions, but an access token issued
-- before the sweep stays valid for up to an hour. INSERTs were already refused
-- (account_is_active() on the content-creation policies), and profiles and
-- buyer_profiles by guard_deleted_account(). Everything else wasn't: proven on
-- 2026-09-24 with a real stale token after the sweep, which could still edit the
-- account's RFQ and review and add a saved item.
--
-- The gate is account_not_deleted(auth.uid()), which refuses status 'deleted'
-- only. Mitra's decision (2026-09-24): NOT account_is_active(), which would also
-- have stopped suspended accounts editing their own rows (pausing ads and
-- products, closing an RFQ, accepting a quote, marking notifications read) and
-- changed what suspension means. So for anyone not deleted, nothing changes.
--
-- Where it goes, for every policy that ties a write to auth.uid() (read from
-- pg_policies, 46 of them; the statements below were generated from the live
-- policy text, so each existing condition is kept exactly):
--   * UPDATE and FOR ALL policies in public: WITH CHECK, so the write fails with
--     42501, and reads (a FOR ALL policy's USING) are unchanged.
--   * DELETE policies in public: USING (the only place a DELETE is checked). A
--     stale token could otherwise delete the account's RFQs, and with them the
--     vendors' quotes, or its reviews: shared history that anonymization keeps.
--   * storage.objects own-folder INSERT and UPDATE (WITH CHECK) and DELETE
--     (USING), all five buckets: a stale token can neither put an avatar back
--     after the sweep removed it nor delete an RFQ or review image.
-- The call is wrapped in (select ...) so Postgres evaluates it once per
-- statement, not per row.

create or replace function public.account_not_deleted(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce to FALSE, as account_is_active(): a missing profiles row fails closed.
  select coalesce((select account_status <> 'deleted' from public.profiles where id = p_id), false);
$$;

comment on function public.account_not_deleted(uuid) is
  'True unless the account is deleted (or has no profiles row). The write gate on own-row policies, so a stale token issued before anonymization cannot write (MPF-7). Suspension is not refused here; content creation checks account_is_active().';

revoke all on function public.account_not_deleted(uuid) from public;
grant execute on function public.account_not_deleted(uuid) to anon, authenticated, service_role;

-- ── UPDATE and FOR ALL policies: WITH CHECK ──────────────────────────────────
alter policy advertisements_update on public.advertisements with check ((((vendor_id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'ads_moderator'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy bprofiles_all on public.buyer_profiles with check ((((id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy catalogues_write on public.catalogues with check ((((vendor_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy conversations_update on public.conversations with check ((((auth.uid() = user_a) OR (auth.uid() = user_b))) and (select public.account_not_deleted((select auth.uid()))));
alter policy follows_write on public.follows with check (((follower_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy notifications_mark_read on public.notifications with check (((profile_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_reviews_update_own on public.product_reviews with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy pvideos_update on public.product_videos with check ((((vendor_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy products_update on public.products with check ((((vendor_id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy profiles_update on public.profiles with check ((((id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy quotes_update on public.quotes with check ((((vendor_id = auth.uid()) OR owns_rfq(rfq_id) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy recent_write on public.recently_viewed with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy reviews_update_own on public.reviews with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy rfqs_update on public.rfqs with check ((((buyer_id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy sfitems_all on public.saved_folder_items with check (((EXISTS ( SELECT 1 FROM saved_folders f WHERE ((f.id = saved_folder_items.folder_id) AND (f.buyer_id = auth.uid()))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy sfolders_all on public.saved_folders with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy sitems_all on public.saved_items with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy saved_videos_owner on public.saved_videos with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy service_reviews_update_own on public.service_reviews with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy vendor_documents_all on public.vendor_documents with check ((((vendor_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy vprofiles_update on public.vendor_profiles with check ((((id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy video_likes_owner on public.video_likes with check (((buyer_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));

-- ── Storage own-folder INSERT and UPDATE: WITH CHECK ─────────────────────────
alter policy avatars_owner_insert on storage.objects with check ((((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy avatars_owner_update on storage.objects with check ((((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy business_docs_owner_insert on storage.objects with check ((((bucket_id = 'business-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy business_docs_owner_update on storage.objects with check ((((bucket_id = 'business-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy catalogues_owner_insert on storage.objects with check ((((bucket_id = 'catalogues'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy catalogues_owner_update on storage.objects with check ((((bucket_id = 'catalogues'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_images_owner_insert on storage.objects with check ((((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_images_owner_update on storage.objects with check ((((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_videos_owner_insert on storage.objects with check ((((bucket_id = 'product-videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_videos_owner_update on storage.objects with check ((((bucket_id = 'product-videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));

-- ── DELETE policies, public and storage: USING ───────────────────────────────
alter policy advertisements_delete on public.advertisements using ((((vendor_id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'ads_moderator'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy notifications_dismiss on public.notifications using (((profile_id = auth.uid())) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_reviews_delete_own on public.product_reviews using ((((buyer_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy pvideos_delete on public.product_videos using ((((vendor_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy products_delete on public.products using ((((vendor_id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy quotes_delete on public.quotes using ((((vendor_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy reviews_delete_own on public.reviews using ((((buyer_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy rfqs_delete on public.rfqs using ((((buyer_id = auth.uid()) OR (is_admin() AND (admin_role() = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type]))))) and (select public.account_not_deleted((select auth.uid()))));
alter policy service_reviews_delete_own on public.service_reviews using ((((buyer_id = auth.uid()) OR is_admin())) and (select public.account_not_deleted((select auth.uid()))));
alter policy avatars_owner_delete on storage.objects using ((((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy business_docs_owner_delete on storage.objects using ((((bucket_id = 'business-docs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy catalogues_owner_delete on storage.objects using ((((bucket_id = 'catalogues'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_images_owner_delete on storage.objects using ((((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));
alter policy product_videos_owner_delete on storage.objects using ((((bucket_id = 'product-videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) and (select public.account_not_deleted((select auth.uid()))));

-- ── Self-check: no write policy tied to auth.uid() is left ungated ───────────
do $$
declare
  v_missing text;
  v_gated integer;
begin
  select string_agg(schemaname || '.' || tablename || ' ' || policyname, ', ')
    into v_missing
    from pg_policies
   where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
     and ((schemaname = 'public' and cmd in ('UPDATE', 'ALL', 'DELETE'))
       or (schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE')))
     and not (case when cmd = 'DELETE' then coalesce(qual, '') else coalesce(with_check, '') end) ~ 'account_not_deleted';
  if v_missing is not null then
    raise exception 'self-check: write policies without the deleted-account gate: %', v_missing;
  end if;
  select count(*) into v_gated
    from pg_policies
   where (case when cmd = 'DELETE' then coalesce(qual, '') else coalesce(with_check, '') end) ~ 'account_not_deleted';
  if v_gated <> 46 then
    raise exception 'self-check: expected 46 gated policies, found %', v_gated;
  end if;
  if not (has_function_privilege('authenticated', 'public.account_not_deleted(uuid)', 'EXECUTE')
          and has_function_privilege('anon', 'public.account_not_deleted(uuid)', 'EXECUTE')) then
    raise exception 'self-check: account_not_deleted() must be executable by anon and authenticated';
  end if;
  -- The demo buyer is active, so the gate is true for it; a deleted account's is false.
  if not public.account_not_deleted('11111111-1111-1111-1111-111111111111') then
    raise exception 'self-check: account_not_deleted() is false for an active account';
  end if;
end;
$$;
