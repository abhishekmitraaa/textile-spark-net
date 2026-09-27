-- Admin completion, Phase 1a (Mitra, 2026-09-27): an admin's WRITES follow the admin's role.
--
-- These RLS policies admitted ANY active admin (`is_admin()`) to write rows that
-- only one or two roles have a job to touch. A Support or Manager account could
-- reprice or delete a subscription plan, delete any profile, rewrite a vendor's
-- KYC review fields or edit a vendor's quote, straight through PostgREST. The
-- panel's roles.ts already hides those actions, but roles.ts is UX only; this
-- makes the database agree with it.
--
--   subscription_plans  ALL                  -> super_admin, finance_admin (+ trg_admin_audit)
--   quotes              UPDATE/DELETE admin  -> super_admin
--   product_videos      INSERT/UPDATE/DELETE -> super_admin, product_moderator
--   catalogues          ALL admin arm        -> super_admin, product_moderator
--   advertisements      admin arm dropped: an admin changes a campaign only through
--                       the review RPCs (SECURITY DEFINER, via ad_apply_decision),
--                       which also write admin.ad_review_log.
--   vendor_documents    the vendor keeps its own-row ALL; admins read only. A KYC
--                       verdict goes through set_vendor_document_verified().
--   buyer_profiles      the buyer keeps its own-row ALL; super_admin and support read.
--   profiles            DELETE -> super_admin; INSERT own row only;
--                       UPDATE admin arm -> super_admin, support.
--   engagement_events   the admin ALL policy is dropped: rows are written only by
--                       log_engagement_event(), and reads keep engagement_events_select.
--
-- Unchanged: every own-row arm, the account_not_deleted() gates, and admin READS
-- (narrowed per role in a later phase, after the pages that read these tables
-- move to RPCs). SECURITY DEFINER functions are unaffected (they bypass RLS).
--
-- Verified before applying: scripts/admin-completion/01_write_matrix.sql, run in the
-- same rolled-back transaction as these statements (10 personas x 14 checks).

-- ── subscription_plans ───────────────────────────────────────────────────────
alter policy subscription_plans_admin on public.subscription_plans
  using (public.is_admin() and public.admin_role() = any (array['super_admin', 'finance_admin']::public.admin_role_type[]))
  with check (public.is_admin() and public.admin_role() = any (array['super_admin', 'finance_admin']::public.admin_role_type[]));

drop trigger if exists trg_admin_audit on public.subscription_plans;
create trigger trg_admin_audit
  after insert or update or delete on public.subscription_plans
  for each row execute function admin.audit_row_change('');

-- ── quotes: the RFQ owner and the vendor keep their arms; admins -> super_admin ──
alter policy quotes_update on public.quotes
  using ((vendor_id = auth.uid()) or public.owns_rfq(rfq_id)
         or (public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type))
  with check (((vendor_id = auth.uid()) or public.owns_rfq(rfq_id)
               or (public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type))
              and (select public.account_not_deleted((select auth.uid()))));

alter policy quotes_delete on public.quotes
  using (((vendor_id = auth.uid())
          or (public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type))
         and (select public.account_not_deleted((select auth.uid()))));

-- ── product_videos and catalogues: moderation roles only ─────────────────────
alter policy pvideos_insert on public.product_videos
  with check (public.account_is_active(auth.uid())
              and ((vendor_id = auth.uid())
                   or (public.is_admin() and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[]))));

alter policy pvideos_update on public.product_videos
  using ((vendor_id = auth.uid())
         or (public.is_admin() and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[])))
  with check (((vendor_id = auth.uid())
               or (public.is_admin() and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[])))
              and (select public.account_not_deleted((select auth.uid()))));

alter policy pvideos_delete on public.product_videos
  using (((vendor_id = auth.uid())
          or (public.is_admin() and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[])))
         and (select public.account_not_deleted((select auth.uid()))));

alter policy catalogues_write on public.catalogues
  using ((vendor_id = auth.uid())
         or (public.is_admin() and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[])))
  with check (((vendor_id = auth.uid())
               or (public.is_admin() and public.admin_role() = any (array['super_admin', 'product_moderator']::public.admin_role_type[])))
              and (select public.account_not_deleted((select auth.uid()))));

-- ── advertisements: the vendor's own rows only; admins go through the RPCs ───
alter policy advertisements_insert on public.advertisements
  with check (public.account_is_active(auth.uid()) and (vendor_id = auth.uid()) and (status <> 'active'::text));

alter policy advertisements_update on public.advertisements
  using (vendor_id = auth.uid())
  with check ((vendor_id = auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

alter policy advertisements_delete on public.advertisements
  using ((vendor_id = auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

-- ── vendor_documents: own-row ALL for the vendor, read-only for admins ───────
alter policy vendor_documents_all on public.vendor_documents
  using (vendor_id = auth.uid())
  with check ((vendor_id = auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

drop policy if exists vendor_documents_admin_read on public.vendor_documents;
create policy vendor_documents_admin_read on public.vendor_documents
  for select using (public.is_admin());

-- ── buyer_profiles: own-row ALL for the buyer, read for super_admin/support ───
alter policy bprofiles_all on public.buyer_profiles
  using (id = auth.uid())
  with check ((id = auth.uid()) and (select public.account_not_deleted((select auth.uid()))));

drop policy if exists bprofiles_admin_read on public.buyer_profiles;
create policy bprofiles_admin_read on public.buyer_profiles
  for select using (public.is_admin() and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[]));

-- ── profiles ─────────────────────────────────────────────────────────────────
alter policy profiles_delete on public.profiles
  using (public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type);

alter policy profiles_insert on public.profiles
  with check (id = auth.uid());

alter policy profiles_update on public.profiles
  using ((id = auth.uid())
         or (public.is_admin() and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[])))
  with check (((id = auth.uid())
               or (public.is_admin() and public.admin_role() = any (array['super_admin', 'support']::public.admin_role_type[])))
              and (select public.account_not_deleted((select auth.uid()))));

-- ── engagement_events: no client write path at all ───────────────────────────
drop policy if exists engagement_events_admin on public.engagement_events;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  r record;
  v_expr text;
begin
  -- Every write policy touched here that mentions is_admin() must also name a role.
  -- (The two admin read policies are SELECT, and deliberate.)
  for r in
    select pol.polname, c.relname,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as expr,
           pol.polcmd
      from pg_policy pol join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('subscription_plans', 'quotes', 'product_videos', 'catalogues', 'advertisements',
                         'vendor_documents', 'buyer_profiles', 'profiles', 'engagement_events')
       and pol.polcmd <> 'r'
  loop
    if position('is_admin()' in r.expr) > 0 and position('admin_role()' in r.expr) = 0 then
      raise exception 'self-check: %.% (cmd %) still admits every admin role: %', r.relname, r.polname, r.polcmd, r.expr;
    end if;
  end loop;

  -- The advertisements write policies have no admin arm left.
  for r in
    select pol.polname,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as expr
      from pg_policy pol
     where pol.polrelid = 'public.advertisements'::regclass and pol.polcmd <> 'r'
  loop
    if position('is_admin()' in r.expr) > 0 then
      raise exception 'self-check: advertisements.% still has an admin arm', r.polname;
    end if;
  end loop;

  if exists (select 1 from pg_policy where polrelid = 'public.engagement_events'::regclass and polcmd <> 'r') then
    raise exception 'self-check: engagement_events still has a write policy';
  end if;

  select pg_get_expr(polqual, polrelid) into v_expr from pg_policy
   where polrelid = 'public.subscription_plans'::regclass and polname = 'subscription_plans_admin';
  if v_expr !~ 'finance_admin' or v_expr !~ 'super_admin' then
    raise exception 'self-check: subscription_plans_admin is %', v_expr;
  end if;

  select pg_get_expr(polqual, polrelid) into v_expr from pg_policy
   where polrelid = 'public.profiles'::regclass and polname = 'profiles_delete';
  if v_expr !~ 'super_admin' or v_expr ~ 'support' then
    raise exception 'self-check: profiles_delete is %', v_expr;
  end if;

  if not exists (select 1 from pg_policy where polrelid = 'public.vendor_documents'::regclass and polname = 'vendor_documents_admin_read' and polcmd = 'r')
     or not exists (select 1 from pg_policy where polrelid = 'public.buyer_profiles'::regclass and polname = 'bprofiles_admin_read' and polcmd = 'r') then
    raise exception 'self-check: an admin read policy is missing';
  end if;

  if not exists (select 1 from pg_trigger where tgrelid = 'public.subscription_plans'::regclass and tgname = 'trg_admin_audit' and not tgisinternal) then
    raise exception 'self-check: trg_admin_audit missing on subscription_plans';
  end if;
end
$check$;
