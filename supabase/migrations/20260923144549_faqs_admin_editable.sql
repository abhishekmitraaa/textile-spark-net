-- Admin-editable FAQs (Phase 9 of the My Profile brief, 2026-09-23).
--
-- The first real admin-editable content in the product. Cosora-Admin's
-- Content.tsx (banners, theme) is still dev-seed only and has no table. FAQs for
-- three surfaces live here, are written from Cosora-Admin's new FAQs page, and are
-- read by the apps with no redeploy:
--   buyer_help           /profile/help (and /help). Grouped by category_label.
--   subscription         the vendor Subscription page, a flat list.
--   seller_registration  <FaqSection>, built but not yet placed on a vendor
--                        onboarding page (placement to be confirmed).
--
-- ── The pattern: admin_block_reason_* (20260921090000), mirrored exactly ──────
-- * Every write goes through a SECURITY DEFINER admin_faq_* function. No client
--   role, service_role included, holds INSERT, UPDATE or DELETE on the table.
-- * Each function is pinned to `search_path = ''` with fully qualified names and
--   uses `#variable_conflict use_column`. The brief asked for "public, extensions",
--   but that is the vector-DB rule (pgvector's `<=>` needs `extensions`). The pattern
--   being mirrored pins '' and is the stricter of the two. Nothing here touches
--   pgvector.
-- * The gates use the same idiom, `coalesce(is_admin() and admin_role() ..., false)`,
--   which fails closed, raising 42501. The LIST is support + super_admin, as for block
--   reasons (support answers buyers' questions and should be able to read what the
--   FAQ says). ADD / UPDATE / DELETE / REORDER are super_admin only. Whether
--   support should also edit is an open question for the owner. Widening it is a
--   one-word change per function.
-- * EXECUTE for authenticated only, no anon (the same ACL as admin_block_reason_*).
--
-- ── Reads ────────────────────────────────────────────────────────────────────
-- anon and authenticated may SELECT rows where `active`, so the buyer Help FAQs
-- render for a signed-out visitor as they did when they were hardcoded. Inactive
-- rows are visible only through admin_faq_list().
--
-- ── Order ────────────────────────────────────────────────────────────────────
-- `position` orders a surface. Buyer Help groups by category_label and orders the
-- groups by their smallest position. The seed spaces positions by 10 (and by 100
-- between categories), so an item can be inserted between two others.
-- admin_faq_reorder() SWAPS with whichever row holds the target position, so
-- "move up" is one atomic call.
--
-- ── Seed ─────────────────────────────────────────────────────────────────────
-- The 12 buyer Help FAQs (Help.tsx `faqCategories`) and the 5 subscription FAQs
-- (Subscription.tsx `FAQS`) move here verbatim, so both pages render as before.
-- Their text was not reviewed or edited on the way. Several buyer Help answers
-- describe features that don't exist (see documentation/myprofileflags.md), and
-- an admin can now correct them without a deploy. The seller-registration seed
-- content and any extra subscription questions come from a content document to be
-- added through the admin UI. They are not written here.

-- ── Table ────────────────────────────────────────────────────────────────────
create table public.faqs (
  id             uuid        primary key default gen_random_uuid(),
  surface        text        not null
                 check (surface in ('buyer_help', 'seller_registration', 'subscription')),
  category_label text,
  question       text        not null check (length(trim(question)) > 0),
  answer         text        not null check (length(trim(answer)) > 0),
  position       integer     not null default 0,
  active         boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid        references public.profiles(id) on delete set null
);

comment on table public.faqs is
  'Admin-editable FAQs for buyer_help / seller_registration / subscription. Clients read active rows; all writes go through admin_faq_* (super_admin).';

-- What the apps ask for: one surface's active rows, in order.
create index faqs_surface_order on public.faqs (surface, position, created_at) where active;

alter table public.faqs enable row level security;

create policy faqs_select_active on public.faqs
  for select to anon, authenticated
  using (active);

-- Supabase grants ALL on every new public table to anon, authenticated and
-- service_role, each in its own right (the certificate_orders lesson).
revoke all on public.faqs from public, anon, authenticated, service_role;
grant select on public.faqs to anon, authenticated;

-- ── admin_faq_list ───────────────────────────────────────────────────────────
create or replace function public.admin_faq_list(p_surface text default null)
returns table(
  id uuid, surface text, category_label text, question text, answer text, "position" integer,
  active boolean, created_at timestamptz, updated_at timestamptz, created_by uuid,
  creator_full_name text, creator_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  -- Gate = the same read audience as admin_block_reason_list (support + SA)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Reading the FAQs requires the support or super_admin role'
      using errcode = '42501';
  end if;

  return query
    select f.id, f.surface, f.category_label, f.question, f.answer, f.position,
           f.active, f.created_at, f.updated_at, f.created_by, pr.full_name, pr.email
      from public.faqs f
      left join public.profiles pr on pr.id = f.created_by
     where p_surface is null or f.surface = p_surface
     order by f.surface, f.position, f.created_at, f.id;
end
$function$;

-- ── admin_faq_add ────────────────────────────────────────────────────────────
create or replace function public.admin_faq_add(
  p_surface text, p_category_label text, p_question text, p_answer text, p_position integer default null
)
returns table(id uuid, surface text, category_label text, question text, answer text, "position" integer, active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_id  uuid;
  v_pos integer;
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Adding an FAQ requires the super_admin role'
      using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in ('buyer_help', 'seller_registration', 'subscription') then
    raise exception 'Unknown FAQ surface %', p_surface using errcode = '22023';
  end if;

  -- One writer per surface at a time, so two adds can't take the same position.
  perform pg_advisory_xact_lock(hashtext('faqs:' || p_surface));

  -- No position given: after everything already on this surface.
  v_pos := coalesce(p_position,
                    (select coalesce(max(f.position), 0) + 10 from public.faqs f where f.surface = p_surface));

  insert into public.faqs as f (surface, category_label, question, answer, position, created_by)
  values (p_surface, nullif(trim(p_category_label), ''), trim(p_question), trim(p_answer), v_pos, auth.uid())
  returning f.id into v_id;

  return query
    select f.id, f.surface, f.category_label, f.question, f.answer, f.position, f.active
      from public.faqs f
     where f.id = v_id;
end
$function$;

-- ── admin_faq_update ─────────────────────────────────────────────────────────
-- NULL leaves a field unchanged. category_label '' (or blank) clears it. The
-- surface is fixed once added (moving one = delete + add). Position is changed
-- only through admin_faq_reorder().
create or replace function public.admin_faq_update(
  p_id uuid, p_category_label text default null, p_question text default null,
  p_answer text default null, p_active boolean default null
)
returns table(id uuid, surface text, category_label text, question text, answer text, "position" integer, active boolean)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Changing an FAQ requires the super_admin role'
      using errcode = '42501';
  end if;

  return query
    update public.faqs f
       set category_label = case when p_category_label is null then f.category_label
                                 else nullif(trim(p_category_label), '') end,
           question   = coalesce(nullif(trim(p_question), ''), f.question),
           answer     = coalesce(nullif(trim(p_answer), ''), f.answer),
           active     = coalesce(p_active, f.active),
           updated_at = now()
     where f.id = p_id
    returning f.id, f.surface, f.category_label, f.question, f.answer, f.position, f.active;
end
$function$;

-- ── admin_faq_delete ─────────────────────────────────────────────────────────
-- Unlike block reasons, nothing references an FAQ, so a real delete is safe.
-- Deactivate is the reversible option, and both are offered.
create or replace function public.admin_faq_delete(p_id uuid)
returns table(id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Deleting an FAQ requires the super_admin role'
      using errcode = '42501';
  end if;

  return query
    delete from public.faqs f where f.id = p_id returning f.id;
end
$function$;

-- ── admin_faq_reorder ────────────────────────────────────────────────────────
-- Moves an FAQ to p_position. Any row on the same surface already there takes
-- the old position: a swap, so "move up / down" is one atomic call and positions
-- stay distinct.
create or replace function public.admin_faq_reorder(p_id uuid, p_position integer)
returns table(id uuid, "position" integer)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_old     integer;
  v_surface text;
begin
  if not coalesce(public.is_admin() and public.admin_role() = 'super_admin'::public.admin_role_type, false) then
    raise exception 'Reordering FAQs requires the super_admin role'
      using errcode = '42501';
  end if;

  select f.position, f.surface into v_old, v_surface from public.faqs f where f.id = p_id;
  if not found then
    return;  -- no row: the caller's assertWrote reports "no rows matched"
  end if;
  perform pg_advisory_xact_lock(hashtext('faqs:' || v_surface));

  update public.faqs f
     set position = v_old, updated_at = now()
   where f.surface = v_surface and f.position = p_position and f.id <> p_id;

  return query
    update public.faqs f
       set position = p_position, updated_at = now()
     where f.id = p_id
    returning f.id, f.position;
end
$function$;

revoke all on function public.admin_faq_list(text)                            from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_add(text, text, text, text, integer)  from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_update(uuid, text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_delete(uuid)                          from public, anon, authenticated, service_role;
revoke all on function public.admin_faq_reorder(uuid, integer)                from public, anon, authenticated, service_role;
grant execute on function public.admin_faq_list(text)                            to authenticated;
grant execute on function public.admin_faq_add(text, text, text, text, integer)  to authenticated;
grant execute on function public.admin_faq_update(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.admin_faq_delete(uuid)                          to authenticated;
grant execute on function public.admin_faq_reorder(uuid, integer)                to authenticated;

-- ── Seed: today's hardcoded FAQs, verbatim ───────────────────────────────────
insert into public.faqs (surface, category_label, question, answer, position) values
  ('buyer_help', 'Getting Started', $q$How do I create my first RFQ (Request for Quote)?$q$, $q$Navigate to 'Post Requirement' from your dashboard or sidebar. You can choose Quick RFQ for simple requests or create a detailed requirement with specifications like category, quantity, fabric type, and more.$q$, 10),
  ('buyer_help', 'Getting Started', $q$How do I find the right vendors for my needs?$q$, $q$Use our smart matching system by posting your requirements. We'll connect you with verified vendors who specialize in your product category. You can also browse vendor profiles and view their ratings and reviews.$q$, 20),
  ('buyer_help', 'Getting Started', $q$What information should I include in my requirement?$q$, $q$Include product category, quantity, preferred fabric/material, size range, any specific designs or prints, target price range, and delivery timeline. The more details you provide, the better quotes you'll receive.$q$, 30),
  ('buyer_help', 'Orders & Quotes', $q$How do I compare quotes from different vendors?$q$, $q$Go to 'My Quotes' section where you can view all received quotes side by side. Our comparison tool highlights the best price and fastest delivery options to help you make informed decisions.$q$, 110),
  ('buyer_help', 'Orders & Quotes', $q$Can I negotiate prices with vendors?$q$, $q$Yes! You can use our integrated chat feature to communicate directly with vendors. Discuss pricing, minimum order quantities, customizations, and delivery terms before finalising your order.$q$, 120),
  ('buyer_help', 'Orders & Quotes', $q$How do I track my order status?$q$, $q$Once you've placed an order, you can track it from your dashboard under 'Active Orders'. You'll receive notifications at each stage — from production to shipping to delivery.$q$, 130),
  ('buyer_help', 'Payments & Billing', $q$What payment methods are accepted?$q$, $q$We support multiple payment options including bank transfers, credit/debit cards, and escrow payments for larger orders. Payment terms can be negotiated directly with vendors.$q$, 210),
  ('buyer_help', 'Payments & Billing', $q$Is my payment secure?$q$, $q$Yes, all transactions are secured with bank-grade encryption. For added protection, we offer escrow services where payment is released to the vendor only after you confirm receipt of goods.$q$, 220),
  ('buyer_help', 'Payments & Billing', $q$Can I get a refund if there's an issue with my order?$q$, $q$Our buyer protection policy covers quality issues and non-delivery. Contact support within 7 days of delivery with photos/documentation of any issues to initiate a refund or replacement request.$q$, 230),
  ('buyer_help', 'Account Management', $q$How do I update my business profile?$q$, $q$Go to Profile from the sidebar, then click 'Edit Profile'. You can update your company information, contact details, shipping addresses, and notification preferences.$q$, 310),
  ('buyer_help', 'Account Management', $q$Can I have multiple team members on one account?$q$, $q$Yes, business accounts can add team members with different permission levels. Go to Settings > Team Management to invite colleagues and assign roles.$q$, 320),
  ('buyer_help', 'Account Management', $q$How do I change my notification settings?$q$, $q$Navigate to Profile > Notifications. You can customise which updates you receive via email, SMS, or push notifications — including quote alerts, order updates, and promotional offers.$q$, 330),
  ('subscription', null, $q$Can I upgrade or downgrade my plan anytime?$q$, $q$Yes. Upgrading takes effect immediately for the period you pay for. There's no autopay — each period (monthly or yearly) is a one-time payment you make explicitly, so you're always in control.$q$, 10),
  ('subscription', null, $q$How does billing work — is there autopay?$q$, $q$No auto-debit. Every billing period is a discrete payment. When your period nears its end you'll get a renew reminder; if you don't renew, your account falls back to the Free plan.$q$, 20),
  ('subscription', null, $q$What payment methods do you accept?$q$, $q$All major cards, UPI, and net banking via Razorpay. Yearly billing gives you two months free versus paying monthly.$q$, 30),
  ('subscription', null, $q$What happens when I reach my lead or product limit?$q$, $q$You'll be prompted to upgrade at the point of action (quoting a lead or publishing a product). Existing listings and quotes are never removed.$q$, 40),
  ('subscription', null, $q$How is GST handled?$q$, $q$Plan prices are exclusive of GST; 18% GST is added at checkout. Add your GSTIN below and it's recorded on every invoice for your input tax credit.$q$, 50);

-- ── Self-checks ──────────────────────────────────────────────────────────────
do $check$
declare
  fn text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.faqs'::regclass) then
    raise exception 'RLS is off on faqs';
  end if;
  if not has_table_privilege('anon', 'public.faqs', 'SELECT')
     or not has_table_privilege('authenticated', 'public.faqs', 'SELECT') then
    raise exception 'faqs is not readable by anon/authenticated';
  end if;
  if has_table_privilege('anon', 'public.faqs', 'INSERT') or has_table_privilege('anon', 'public.faqs', 'UPDATE') or has_table_privilege('anon', 'public.faqs', 'DELETE')
     or has_table_privilege('authenticated', 'public.faqs', 'INSERT') or has_table_privilege('authenticated', 'public.faqs', 'UPDATE') or has_table_privilege('authenticated', 'public.faqs', 'DELETE')
     or has_table_privilege('service_role', 'public.faqs', 'INSERT') or has_table_privilege('service_role', 'public.faqs', 'UPDATE') or has_table_privilege('service_role', 'public.faqs', 'DELETE') then
    raise exception 'a client role can write faqs directly';
  end if;

  foreach fn in array array[
    'public.admin_faq_list(text)', 'public.admin_faq_add(text,text,text,text,integer)',
    'public.admin_faq_update(uuid,text,text,text,boolean)', 'public.admin_faq_delete(uuid)',
    'public.admin_faq_reorder(uuid,integer)'] loop
    if not (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = fn::regprocedure) then
      raise exception '% is not SECURITY DEFINER with search_path pinned to ''''', fn;
    end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE')
       or has_function_privilege('anon', fn, 'EXECUTE')
       or has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception '% grants are wrong (authenticated only)', fn;
    end if;
  end loop;

  if (select count(*) from public.faqs where surface = 'buyer_help') <> 12
     or (select count(*) from public.faqs where surface = 'subscription') <> 5 then
    raise exception 'seed counts are wrong';
  end if;
end
$check$;
