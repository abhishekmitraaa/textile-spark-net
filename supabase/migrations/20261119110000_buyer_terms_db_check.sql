-- Medium bugs batch 2, M-61 (Mitra, 2026-11-19: "Database checks").
--
-- Accepting the buyer Terms was checked only by the app's navigation (BuyerSignupGate). A signed-in account that never
-- accepted them could post requirements, start and send chats and write reviews through the API. While the
-- `buyer_signup_required` switch is on for the account, those writes are now refused by the database until the account
-- is onboarded with a Terms record, mirroring the gate:
--   - sellers are never caught: registered (onboarding_complete), exempt, or with a registration waiting for approval
--     (they sign the Supplier Agreement, not the buyer Terms);
--   - Cosora staff are never caught;
--   - server code (service role, jobs, migrations) is never caught (admin.trusted_caller()).
-- Help, fraud reports, feedback and support threads are other tables and stay open.
-- Requirements are written to rfq_submissions (Cosora reviews them before they become rfqs rows) and, for a request to
-- one seller, to rfqs: both are checked (commit security review, 2026-11-19).
-- A seller who submitted a registration (any outcome: a registration sent back for changes too) may still send chat
-- messages, so it keeps answering buyers (code review, 2026-11-19). The proof is a vendor_registrations row, written
-- only by submit_vendor_registration(); never profiles.active_role, which the account sets itself (commit security
-- review, 2026-11-19). It may not post requirements, start chats or write reviews as a buyer until it accepted the Terms.

create or replace function admin.caller_may_act_as_buyer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    admin.trusted_caller()
    or (select auth.uid()) is null
    or not admin.feature_on_for('buyer_signup_required', (select auth.uid()))
    or exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.onboarded and p.terms_version is not null)
    or exists (select 1 from admin.admin_users a where a.id = (select auth.uid()) and a.is_active)
    or exists (select 1 from public.vendor_profiles v where v.id = (select auth.uid()) and v.onboarding_complete)
    or exists (select 1 from admin.registration_exempt e where e.vendor_id = (select auth.uid()))
    or exists (select 1 from public.vendor_registrations r
                where r.vendor_id = (select auth.uid()) and r.status = 'pending_review');
$$;

revoke all on function admin.caller_may_act_as_buyer() from public, anon, authenticated;

create or replace function admin.enforce_buyer_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- admin.is_real_seller(): registered, exempt, or holding seller content (listings, quotes…): never self-asserted.
  if tg_table_name = 'messages'
     and (exists (select 1 from public.vendor_registrations r where r.vendor_id = (select auth.uid()))
          or admin.is_real_seller((select auth.uid()))) then
    return new;
  end if;
  if not admin.caller_may_act_as_buyer() then
    raise exception 'Accept the Cosora Terms to continue'
      using errcode = '42501', hint = 'terms_required';
  end if;
  return new;
end
$$;

revoke all on function admin.enforce_buyer_terms() from public, anon, authenticated;

drop trigger if exists trg_rfqs_buyer_terms on public.rfqs;
create trigger trg_rfqs_buyer_terms before insert on public.rfqs
  for each row execute function admin.enforce_buyer_terms();

drop trigger if exists trg_rfq_submissions_buyer_terms on public.rfq_submissions;
create trigger trg_rfq_submissions_buyer_terms before insert on public.rfq_submissions
  for each row execute function admin.enforce_buyer_terms();

drop trigger if exists trg_conversations_buyer_terms on public.conversations;
create trigger trg_conversations_buyer_terms before insert on public.conversations
  for each row execute function admin.enforce_buyer_terms();

drop trigger if exists trg_messages_buyer_terms on public.messages;
create trigger trg_messages_buyer_terms before insert on public.messages
  for each row execute function admin.enforce_buyer_terms();

drop trigger if exists trg_reviews_buyer_terms on public.reviews;
create trigger trg_reviews_buyer_terms before insert on public.reviews
  for each row execute function admin.enforce_buyer_terms();

drop trigger if exists trg_product_reviews_buyer_terms on public.product_reviews;
create trigger trg_product_reviews_buyer_terms before insert on public.product_reviews
  for each row execute function admin.enforce_buyer_terms();

drop trigger if exists trg_service_reviews_buyer_terms on public.service_reviews;
create trigger trg_service_reviews_buyer_terms before insert on public.service_reviews
  for each row execute function admin.enforce_buyer_terms();

-- Self-check: every trigger is in place, and a migration (trusted) passes the check.
do $$
declare n int;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where t.tgname like 'trg_%_buyer_terms' and not t.tgisinternal
     and c.relname in ('rfqs', 'rfq_submissions', 'conversations', 'messages', 'reviews', 'product_reviews', 'service_reviews');
  if n <> 7 then raise exception 'self-check: % of 7 buyer-terms triggers', n; end if;
  if not admin.caller_may_act_as_buyer() then raise exception 'self-check: a migration must pass'; end if;
end $$;
