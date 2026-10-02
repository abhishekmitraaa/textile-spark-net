-- ─────────────────────────────────────────────────────────────────────────────
-- Admin completion Phase 12: the RLS performance pass (2026-10-02). No access changes.
--
-- 1. Every policy in `public` and `admin` that called auth.uid(), is_admin(),
--    admin_role() or account_is_active(auth.uid()) bare now wraps the call in a scalar
--    subquery: (select auth.uid()), (select public.is_admin()), ... Postgres then runs it
--    once per statement as an InitPlan instead of once per row. is_admin(),
--    admin_role() and account_is_active() are SECURITY DEFINER, which Postgres never
--    inlines, so each bare call was a separate query against admin.admin_users or
--    profiles for every row scanned. All four are STABLE and depend only on the caller,
--    so one evaluation per statement gives the same answer. 87 policies are rewritten
--    this way (the advisor flagged the auth.uid() ones as auth_rls_initplan, 53 before
--    this migration; it doesn't flag is_admin()). Row-dependent helpers
--    (owns_product(product_id), owns_rfq(rfq_id), is_conversation_member(conversation_id))
--    stay per row: they take the row's id.
--
-- 2. Ten tables had a FOR ALL write policy beside their SELECT policy, so reads
--    evaluated both (multiple_permissive_policies, 50 warnings). Each ALL policy is
--    replaced by INSERT, UPDATE and DELETE policies with the same expressions, so writes
--    are unchanged. Reads are unchanged because on each table the ALL policy's USING
--    admits no row its SELECT policy doesn't (checked one by one):
--      catalogues      write: own or super/product_mod  ⊆  select: live or own or admin
--      categories      write: admin                     ⊆  select: true
--      follows         write: own                       ⊆  select: own or admin
--      product_images  write: owns_product or admin     ⊆  select: product live, own or admin
--                      (owns_product() is the caller's own product, which products_select shows)
--      recently_viewed write: own                       =  select: own
--      subscription_invoices / vendor_subscriptions
--                      admin: super, finance            ⊆  select: own or super, finance, support
--      subscription_plans
--                      admin: super, finance            ⊆  select: true
--    buyer_profiles and vendor_documents had the owner's rows in the ALL policy and the
--    admins' in a separate SELECT policy; their one SELECT policy is now the union of
--    the two (bprofiles_select, vendor_documents_select).
--
-- Not touched: storage.objects policies (owned by supabase_storage_admin), and the
-- policies' roles. Generated from the live pg_policies text, so each expression is the
-- live one with only the wrapping changed.
-- Checked before applying: scripts/admin-completion/16_rls_equivalence.sql (every
-- persona's rows and write reach in every RLS table, before and after, in one snapshot).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Per-statement evaluation ──────────────────────────────────────────────
alter policy account_suspensions_select on admin.account_suspensions
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy ad_review_log_select on admin.ad_review_log
  using (((EXISTS ( SELECT 1
   FROM advertisements a
  WHERE ((a.id = ad_review_log.ad_id) AND (a.vendor_id = (select auth.uid()))))) OR (select public.is_admin())));

alter policy admin_flags_delete on admin.admin_flags
  using (((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type)));

alter policy admin_flags_insert on admin.admin_flags
  with check (((select public.is_admin()) AND (author_id = (select auth.uid()))));

alter policy admin_flags_select on admin.admin_flags
  using ((select public.is_admin()));

alter policy chat_block_reasons_delete on admin.chat_block_reasons
  using (((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type)));

alter policy chat_block_reasons_insert on admin.chat_block_reasons
  with check (((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type)));

alter policy chat_block_reasons_select on admin.chat_block_reasons
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy chat_block_reasons_update on admin.chat_block_reasons
  using (((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type)))
  with check (((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type)));

alter policy conversation_reviews_select on admin.conversation_reviews
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy conversation_reviews_update on admin.conversation_reviews
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))))
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy flag_patterns_delete on admin.flag_patterns
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy flag_patterns_insert on admin.flag_patterns
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy flag_patterns_select on admin.flag_patterns
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy flag_patterns_update on admin.flag_patterns
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))))
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy keyword_blocklist_delete on admin.keyword_blocklist
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy keyword_blocklist_insert on admin.keyword_blocklist
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy keyword_blocklist_select on admin.keyword_blocklist
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type]))));

alter policy account_deletion_requests_select on public.account_deletion_requests
  using (((user_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type])))));

alter policy ad_orders_select_own on public.ad_orders
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'ads_moderator'::admin_role_type, 'finance_admin'::admin_role_type, 'support'::admin_role_type])))));

alter policy advertisements_delete on public.advertisements
  using (((vendor_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy advertisements_insert on public.advertisements
  with check (((select public.account_is_active((select auth.uid()))) AND (vendor_id = (select auth.uid())) AND (status <> 'active'::text)));

alter policy advertisements_select on public.advertisements
  using (((vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy advertisements_update on public.advertisements
  using ((vendor_id = (select auth.uid())))
  with check (((vendor_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy calls_select on public.calls
  using (((buyer_id = (select auth.uid())) OR (vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy catalogues_select on public.catalogues
  using (((status = 'live'::product_status) OR (vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy certificate_orders_read on public.certificate_orders
  using ((COALESCE((vendor_id = (select auth.uid())), false) OR (COALESCE((select public.is_admin()), false) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type])))));

alter policy conversations_insert on public.conversations
  with check ((((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b)));

alter policy conversations_select on public.conversations
  using ((((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type])))));

alter policy conversations_update on public.conversations
  using ((((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b)))
  with check (((((select auth.uid()) = user_a) OR ((select auth.uid()) = user_b)) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy engagement_events_select on public.engagement_events
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type))));

alter policy follows_select on public.follows
  using (((follower_id = (select auth.uid())) OR (select public.is_admin())));

alter policy messages_insert on public.messages
  with check (((sender_id = (select auth.uid())) AND is_conversation_member(conversation_id) AND (( SELECT c.status
   FROM conversations c
  WHERE (c.id = messages.conversation_id)) = 'active'::text) AND (( SELECT p.account_status
   FROM profiles p
  WHERE (p.id = (select auth.uid()))) = 'active'::account_status_type)));

alter policy messages_select on public.messages
  using ((is_conversation_member(conversation_id) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['support'::admin_role_type, 'super_admin'::admin_role_type])))));

alter policy notifications_dismiss on public.notifications
  using (((profile_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy notifications_mark_read on public.notifications
  using ((profile_id = (select auth.uid())))
  with check (((profile_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy notifications_select on public.notifications
  using ((profile_id = (select auth.uid())));

alter policy pimages_select on public.product_images
  using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_images.product_id) AND ((p.status = 'live'::product_status) OR (p.vendor_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy product_reviews_delete_own on public.product_reviews
  using ((((buyer_id = (select auth.uid())) OR (select public.is_admin())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy product_reviews_insert_own on public.product_reviews
  with check (((buyer_id = (select auth.uid())) AND (select public.account_is_active((select auth.uid())))));

alter policy product_reviews_update_own on public.product_reviews
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy pvideos_delete on public.product_videos
  using ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy pvideos_insert on public.product_videos
  with check (((select public.account_is_active((select auth.uid()))) AND ((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type]))))));

alter policy pvideos_select on public.product_videos
  using (((status = 'live'::product_status) OR (vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy pvideos_update on public.product_videos
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))))
  with check ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy products_delete on public.products
  using ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy products_insert on public.products
  with check (((select public.account_is_active((select auth.uid()))) AND ((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type]))))));

alter policy products_select on public.products
  using (((status = 'live'::product_status) OR (vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy products_update on public.products
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))))
  with check ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy profiles_delete on public.profiles
  using (((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type)));

alter policy profiles_insert on public.profiles
  with check ((id = (select auth.uid())));

alter policy profiles_update on public.profiles
  using (((id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'support'::admin_role_type])))))
  with check ((((id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'support'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy quotes_delete on public.quotes
  using ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy quotes_insert on public.quotes
  with check (((vendor_id = (select auth.uid())) AND (select public.account_is_active((select auth.uid())))));

alter policy quotes_select on public.quotes
  using (((vendor_id = (select auth.uid())) OR (select public.is_admin()) OR owns_rfq(rfq_id)));

alter policy quotes_update on public.quotes
  using (((vendor_id = (select auth.uid())) OR owns_rfq(rfq_id) OR ((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type))))
  with check ((((vendor_id = (select auth.uid())) OR owns_rfq(rfq_id) OR ((select public.is_admin()) AND ((select public.admin_role()) = 'super_admin'::admin_role_type))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy recent_select on public.recently_viewed
  using ((buyer_id = (select auth.uid())));

alter policy reviews_delete_own on public.reviews
  using ((((buyer_id = (select auth.uid())) OR (select public.is_admin())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy reviews_insert_own on public.reviews
  with check (((buyer_id = (select auth.uid())) AND (select public.account_is_active((select auth.uid())))));

alter policy reviews_update_own on public.reviews
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy rfqs_delete on public.rfqs
  using ((((buyer_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy rfqs_insert on public.rfqs
  with check (((buyer_id = (select auth.uid())) AND (select public.account_is_active((select auth.uid())))));

alter policy rfqs_select on public.rfqs
  using ((((status = 'active'::rfq_status) AND ((vendor_id IS NULL) OR (vendor_id = (select auth.uid())))) OR (buyer_id = (select auth.uid())) OR (select public.is_admin())));

alter policy rfqs_update on public.rfqs
  using (((buyer_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))))
  with check ((((buyer_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy sfitems_all on public.saved_folder_items
  using ((EXISTS ( SELECT 1
   FROM saved_folders f
  WHERE ((f.id = saved_folder_items.folder_id) AND (f.buyer_id = (select auth.uid()))))))
  with check (((EXISTS ( SELECT 1
   FROM saved_folders f
  WHERE ((f.id = saved_folder_items.folder_id) AND (f.buyer_id = (select auth.uid()))))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy sfolders_all on public.saved_folders
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy sitems_all on public.saved_items
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy saved_videos_owner on public.saved_videos
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy service_reviews_delete_own on public.service_reviews
  using ((((buyer_id = (select auth.uid())) OR (select public.is_admin())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy service_reviews_insert_own on public.service_reviews
  with check (((buyer_id = (select auth.uid())) AND (select public.account_is_active((select auth.uid())))));

alter policy service_reviews_update_own on public.service_reviews
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy subscription_invoices_select on public.subscription_invoices
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type, 'support'::admin_role_type])))));

alter policy subscription_payment_orders_select on public.subscription_payment_orders
  using (((vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy subscription_usage_select on public.subscription_usage
  using (((vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy support_attachments_select on public.support_attachments
  using (((requester_can_view AND (status = 'clean'::text) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_attachments.ticket_id) AND (t.requester_id = (select auth.uid())))))) OR COALESCE((((select public.admin_role()))::text = ANY (ARRAY['super_admin'::text, 'support'::text, 'manager'::text])), false)));

alter policy support_events_select on public.support_events
  using (COALESCE((((select public.admin_role()))::text = ANY (ARRAY['super_admin'::text, 'support'::text, 'manager'::text])), false));

alter policy support_messages_select on public.support_messages
  using ((((visibility = 'public'::text) AND (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND (t.requester_id = (select auth.uid())))))) OR COALESCE((((select public.admin_role()))::text = ANY (ARRAY['super_admin'::text, 'support'::text, 'manager'::text])), false)));

alter policy support_ticket_staff_select on public.support_ticket_staff
  using (COALESCE((((select public.admin_role()))::text = ANY (ARRAY['super_admin'::text, 'support'::text, 'manager'::text])), false));

alter policy support_tickets_select on public.support_tickets
  using (((requester_id = (select auth.uid())) OR COALESCE((((select public.admin_role()))::text = ANY (ARRAY['super_admin'::text, 'support'::text, 'manager'::text])), false)));

alter policy vendor_ad_verifications_select on public.vendor_ad_verifications
  using (((vendor_id = (select auth.uid())) OR (select public.is_admin())));

alter policy vendor_contracts_insert on public.vendor_contracts
  with check ((vendor_id = (select auth.uid())));

alter policy vendor_contracts_select on public.vendor_contracts
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type, 'support'::admin_role_type])))));

alter policy vprofiles_delete on public.vendor_profiles
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type]))));

alter policy vprofiles_insert on public.vendor_profiles
  with check (((id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type])))));

alter policy vprofiles_update on public.vendor_profiles
  using (((id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type])))))
  with check ((((id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

alter policy vendor_subscriptions_select on public.vendor_subscriptions
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type, 'support'::admin_role_type])))));

alter policy video_likes_owner on public.video_likes
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

-- ── 2. One policy per command on the ten tables that had ALL beside SELECT ───
drop policy bprofiles_admin_read on public.buyer_profiles;

create policy bprofiles_insert on public.buyer_profiles for insert to public
  with check (((id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy bprofiles_update on public.buyer_profiles for update to public
  using ((id = (select auth.uid())))
  with check (((id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy bprofiles_delete on public.buyer_profiles for delete to public
  using ((id = (select auth.uid())));

create policy bprofiles_select on public.buyer_profiles for select to public
  using (((id = (select auth.uid()))) or (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'support'::admin_role_type])))));

drop policy bprofiles_all on public.buyer_profiles;

create policy catalogues_insert on public.catalogues for insert to public
  with check ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy catalogues_update on public.catalogues for update to public
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))))
  with check ((((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy catalogues_delete on public.catalogues for delete to public
  using (((vendor_id = (select auth.uid())) OR ((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'product_moderator'::admin_role_type])))));

drop policy catalogues_write on public.catalogues;

create policy categories_insert on public.categories for insert to public
  with check ((select public.is_admin()));

create policy categories_update on public.categories for update to public
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy categories_delete on public.categories for delete to public
  using ((select public.is_admin()));

drop policy categories_write on public.categories;

create policy follows_insert on public.follows for insert to public
  with check (((follower_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy follows_update on public.follows for update to public
  using ((follower_id = (select auth.uid())))
  with check (((follower_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy follows_delete on public.follows for delete to public
  using ((follower_id = (select auth.uid())));

drop policy follows_write on public.follows;

create policy pimages_insert on public.product_images for insert to public
  with check ((owns_product(product_id) OR (select public.is_admin())));

create policy pimages_update on public.product_images for update to public
  using ((owns_product(product_id) OR (select public.is_admin())))
  with check ((owns_product(product_id) OR (select public.is_admin())));

create policy pimages_delete on public.product_images for delete to public
  using ((owns_product(product_id) OR (select public.is_admin())));

drop policy pimages_write on public.product_images;

create policy recent_insert on public.recently_viewed for insert to public
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy recent_update on public.recently_viewed for update to public
  using ((buyer_id = (select auth.uid())))
  with check (((buyer_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy recent_delete on public.recently_viewed for delete to public
  using ((buyer_id = (select auth.uid())));

drop policy recent_write on public.recently_viewed;

create policy subscription_invoices_admin_insert on public.subscription_invoices for insert to public
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

create policy subscription_invoices_admin_update on public.subscription_invoices for update to public
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))))
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

create policy subscription_invoices_admin_delete on public.subscription_invoices for delete to public
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

drop policy subscription_invoices_admin on public.subscription_invoices;

create policy subscription_plans_admin_insert on public.subscription_plans for insert to public
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

create policy subscription_plans_admin_update on public.subscription_plans for update to public
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))))
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

create policy subscription_plans_admin_delete on public.subscription_plans for delete to public
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

drop policy subscription_plans_admin on public.subscription_plans;

drop policy vendor_documents_admin_read on public.vendor_documents;

create policy vendor_documents_insert on public.vendor_documents for insert to public
  with check (((vendor_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy vendor_documents_update on public.vendor_documents for update to public
  using ((vendor_id = (select auth.uid())))
  with check (((vendor_id = (select auth.uid())) AND ( SELECT account_not_deleted((select auth.uid())) AS account_not_deleted)));

create policy vendor_documents_delete on public.vendor_documents for delete to public
  using ((vendor_id = (select auth.uid())));

create policy vendor_documents_select on public.vendor_documents for select to public
  using (((vendor_id = (select auth.uid()))) or (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'vendor_ops'::admin_role_type, 'support'::admin_role_type])))));

drop policy vendor_documents_all on public.vendor_documents;

create policy vendor_subscriptions_admin_insert on public.vendor_subscriptions for insert to public
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

create policy vendor_subscriptions_admin_update on public.vendor_subscriptions for update to public
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))))
  with check (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

create policy vendor_subscriptions_admin_delete on public.vendor_subscriptions for delete to public
  using (((select public.is_admin()) AND ((select public.admin_role()) = ANY (ARRAY['super_admin'::admin_role_type, 'finance_admin'::admin_role_type]))));

drop policy vendor_subscriptions_admin on public.vendor_subscriptions;

-- ── 3. Self-check ────────────────────────────────────────────────────────────
do $check$
declare
  r record;
  bad text := '';
begin
  -- No policy in public or admin calls these per row any more.
  for r in
    select schemaname, tablename, policyname,
           replace(replace(replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
             '( SELECT auth.uid() AS uid)', ''),
             '( SELECT is_admin() AS is_admin)', ''),
             '( SELECT admin_role() AS admin_role)', '') as rest
      from pg_policies
     where schemaname in ('public', 'admin')
  loop
    if r.rest ~ 'auth\.uid\(\)|\mis_admin\(\)|\madmin_role\(\)' then
      bad := bad || format(' %s.%s.%s', r.schemaname, r.tablename, r.policyname);
    end if;
  end loop;
  if bad <> '' then
    raise exception 'Phase 12 self-check: per-row calls remain in:%', bad;
  end if;

  -- The ten tables: no ALL policy, exactly one SELECT policy, and one policy for each write.
  for r in
    select t.tbl,
           count(p.*) filter (where p.cmd = 'ALL') as n_all,
           count(p.*) filter (where p.cmd = 'SELECT') as n_select,
           count(p.*) filter (where p.cmd = 'INSERT') as n_insert,
           count(p.*) filter (where p.cmd = 'UPDATE') as n_update,
           count(p.*) filter (where p.cmd = 'DELETE') as n_delete
      from unnest(array['buyer_profiles', 'catalogues', 'categories', 'follows', 'product_images', 'recently_viewed',
                        'subscription_invoices', 'subscription_plans', 'vendor_documents', 'vendor_subscriptions']) as t(tbl)
      left join pg_policies p on p.schemaname = 'public' and p.tablename = t.tbl
     group by t.tbl
  loop
    if r.n_all <> 0 or r.n_select <> 1 or r.n_insert <> 1 or r.n_update <> 1 or r.n_delete <> 1 then
      bad := bad || format(' %s (all %s, select %s, insert %s, update %s, delete %s)',
                           r.tbl, r.n_all, r.n_select, r.n_insert, r.n_update, r.n_delete);
    end if;
  end loop;
  if bad <> '' then
    raise exception 'Phase 12 self-check: policy shape is wrong on:%', bad;
  end if;
end
$check$;
