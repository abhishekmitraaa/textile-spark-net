-- Cosora-Admin review 2026-11-22, High batch 1 (documentation/admin-review-high-fixes-plan-2026-11-22.md):
--   AR-H01 an admin cancel / plan change / guarantee close refuses while the seller has autopay (the admin's
--          action cancels it first, through subscription-autopay's admin_cancel)
--   AR-H02 a paid order is refused as stale only when its credit was used elsewhere, never because a price changed
--   AR-H03 a seller can't change a KYC document's row after submitting it (the app replaces documents)
--   AR-H05 taking a support request a colleague holds is an explicit take-over
--   AR-H08 a blocked keyword must be 3+ characters and absent from ordinary business messages
--   AR-H09 the Vendors page reads pages of 50 from the database, with search, instead of every vendor
--   AR-H10 a listing decision applies only to the content the moderator was shown (listing revisions)
--   AR-H11 rejected -> live tells the seller, like under_review -> live
--   AR-H12 the support counts read open requests only (every count already required it)
-- The storage half of AR-H03 is 20261122100200, applied only after the buyer app stops overwriting KYC files.

begin;

-- ── AR-H01 ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function admin.vendor_has_live_mandate(p_vendor uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  -- The same statuses admin_subscription_grant refuses on: Razorpay may still charge any of them.
  select exists (select 1 from public.subscription_mandates m
                  where m.vendor_id = p_vendor and m.ended_at is null
                    and m.status in ('authenticated', 'active', 'pending', 'halted'))
$function$;
revoke all on function admin.vendor_has_live_mandate(uuid) from public, anon, authenticated;

-- The admin's autopay cancel (subscription-autopay, action admin_cancel) goes in the Admin Log.
alter table admin.audit_log drop constraint if exists audit_log_action_check;
alter table admin.audit_log add constraint audit_log_action_check
  check (action = any (array['insert', 'update', 'delete', 'sign_in', 'sign_out', 'invite', 'refund', 'reveal_contact',
                              'autopay_cancel']));
do $$
declare
  d   text := replace(pg_get_functiondef('public.admin_audit_record(uuid,text,text,text,jsonb,text)'::regprocedure), E'\r\n', E'\n');
  old text := 'p_action in (''invite'', ''refund'')';
  new text := 'p_action in (''invite'', ''refund'', ''autopay_cancel'')';
begin
  if position(new in d) > 0 then
    return;
  end if;
  if (length(d) - length(replace(d, old, ''))) / length(old) <> 1 then
    raise exception 'AR-H01: the action list was not found exactly once in admin_audit_record';
  end if;
  execute replace(d, old, new);
end
$$;

create or replace function public.admin_subscription_cancel(p_subscription_id uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sub public.vendor_subscriptions;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: canceling a subscription requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required to cancel a subscription' using errcode = '22023';
  end if;

  select * into v_sub from public.vendor_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'no subscription %', p_subscription_id using errcode = 'P0002';
  end if;
  if v_sub.status in ('canceled', 'expired') then
    raise exception 'this subscription is already %', v_sub.status using errcode = 'P0001';
  end if;
  -- AR-H01: a running autopay would charge again and bring the plan back. Cosora-Admin cancels it first.
  if admin.vendor_has_live_mandate(v_sub.vendor_id) then
    raise exception 'This seller has autopay on. Turn it off first, then cancel the plan.'
      using errcode = 'P0001', hint = 'autopay_active';
  end if;

  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);

  update public.vendor_subscriptions
     set status = 'canceled',
         auto_renew = false,
         current_period_end = case when current_period_end > now() then now() else current_period_end end,
         updated_at = now()
   where id = v_sub.id;

  -- The trust seal and search boost end with the plan.
  update public.vendor_profiles
     set plan_expires_at = now()
   where id = v_sub.vendor_id
     and plan_expires_at > now();

  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(
    v_sub.vendor_id, 'subscription_canceled', 'Your subscription was canceled',
    'Cosora canceled your subscription, so your plan has ended. Contact support if you think this is a mistake.',
    null);
end;
$function$;

create or replace function public.admin_subscription_change_plan(p_subscription_id uuid, p_plan_id text, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sub  public.vendor_subscriptions;
  v_plan public.subscription_plans;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: changing a vendor''s plan requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'a reason is required to change a vendor''s plan' using errcode = '22023';
  end if;

  select * into v_sub from public.vendor_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'no subscription %', p_subscription_id using errcode = 'P0002';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found then
    raise exception 'unknown plan %', p_plan_id using errcode = '22023';
  end if;
  if v_plan.id = 'free' then
    raise exception 'to move a vendor to Free, cancel the subscription instead' using errcode = '22023';
  end if;
  if v_plan.id = v_sub.plan_id then
    raise exception 'this subscription is already on the % plan', v_plan.name using errcode = 'P0001';
  end if;
  -- AR-H01: the autopay renews the plan it was made for, which would undo this change at the next charge.
  if admin.vendor_has_live_mandate(v_sub.vendor_id) then
    raise exception 'This seller has autopay on for their current plan. Turn it off first, then change the plan.'
      using errcode = 'P0001', hint = 'autopay_active';
  end if;

  perform set_config('cosora.audit_reason', left(btrim(p_reason), 500), true);

  update public.vendor_subscriptions set plan_id = v_plan.id, updated_at = now() where id = v_sub.id;

  -- The plan cached on vendor_profiles (trust seal, search boost) follows while the
  -- subscription is running. A lapsed row keeps the vendor on Free until they pay.
  if v_sub.status = 'active' and v_sub.current_period_end > now() then
    update public.vendor_profiles
       set plan_id = v_plan.id, plan_expires_at = v_sub.current_period_end
     where id = v_sub.vendor_id;
  end if;

  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(
    v_sub.vendor_id, 'subscription_changed', 'Your plan was changed',
    format('Cosora moved your subscription to the %s plan. Your current period end is unchanged.', v_plan.name),
    null);
end;
$function$;

create or replace function public.admin_refund_guarantee_close(p_request_id uuid, p_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_req public.refund_guarantee_requests;
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: closing a refund request requires the super_admin or finance_admin role'
      using errcode = '42501';
  end if;
  select * into v_req from public.refund_guarantee_requests where id = p_request_id for update;
  if not found then
    raise exception 'no refund request %', p_request_id using errcode = 'P0002';
  end if;
  if v_req.status <> 'open' then
    raise exception 'this request is already closed' using errcode = 'P0001';
  end if;
  -- Processed, or with Razorpay. Not "has a refund id": a failed refund keeps its id (2026-10-20).
  if exists (select 1 from public.subscription_invoices i
              where i.id = any (v_req.invoice_ids)
                and coalesce(i.refund_status, '') not in ('processed', 'pending')) then
    raise exception 'refund every payment in the request first' using errcode = 'P0001', hint = 'refund_first';
  end if;
  -- AR-H01: a refunded seller must not be charged again by autopay.
  if admin.vendor_has_live_mandate(v_req.vendor_id) then
    raise exception 'This seller has autopay on. Turn it off first, then close the request.'
      using errcode = 'P0001', hint = 'autopay_active';
  end if;

  perform set_config('cosora.audit_reason', left(coalesce(nullif(btrim(p_note), ''), '7-day money-back guarantee'), 500), true);
  update public.vendor_subscriptions
     set status = 'canceled', auto_renew = false,
         current_period_end = case when current_period_end > now() then now() else current_period_end end,
         scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null,
         updated_at = now()
   where vendor_id = v_req.vendor_id and status = 'active';
  update public.vendor_profiles
     set plan_expires_at = now()
   where id = v_req.vendor_id and plan_expires_at > now();
  update public.refund_guarantee_requests
     set status = 'closed', closed_at = now(), closed_by = auth.uid(),
         close_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
   where id = v_req.id;
  perform set_config('cosora.audit_reason', '', true);

  perform public.notify(v_req.vendor_id, 'refund_processed', 'Your refund is on its way',
    format('We refunded ₹%s under the 7-day money-back guarantee, and your plan has ended. A refund usually reaches your account in 5–7 working days.',
           to_char(v_req.total_rupees, 'FM99,99,99,999')),
    null);
end
$function$;

-- ── AR-H02 ────────────────────────────────────────────────────────────────────────────────────────────────────
-- subscription_fulfil re-prices an order as of its creation to catch a credit counted twice (F07). It compared
-- today's charge with what the order charged, so a price rise refused every paid order priced before it, autopay
-- renewals included (the mandate keeps its price). Stale now means only: the credit still available is less than the
-- credit this order counted. Patched by anchored text: production's stored body has CRLF line endings.
do $$
declare
  d   text := replace(pg_get_functiondef('public.subscription_fulfil(text,text,text)'::regprocedure), E'\r\n', E'\n');
  old text := 'v_stale := coalesce((q ->> ''ok'')::boolean, false) and (q ->> ''charge_rupees'')::integer > o.list_rupees;';
  new text := 'v_stale := coalesce((q ->> ''ok'')::boolean, false)'
              || E'\n               -- AR-H02: the credit this order counted must still be there; a price change is not staleness.'
              || E'\n               and coalesce((q ->> ''credit_rupees'')::integer, 0) < coalesce(o.credit_rupees, 0);';
begin
  if position(new in d) > 0 then
    return;  -- already applied
  end if;
  if (length(d) - length(replace(d, old, ''))) / length(old) <> 1 then
    raise exception 'AR-H02: the stale-price line was not found exactly once in subscription_fulfil';
  end if;
  execute replace(d, old, new);
end
$$;

-- ── AR-H03 (rows) ─────────────────────────────────────────────────────────────────────────────────────────────
-- The app never updates a document row: a replacement is a new row and the old one is deleted
-- (replaceVendorDocuments()). The update policy only let a seller change a verified row's file, type or details.
drop policy if exists vendor_documents_update on public.vendor_documents;

create or replace function public.vendor_documents_guard_review_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- An admin reaches these columns through set_vendor_document_verified(),
  -- which runs SECURITY DEFINER but keeps the caller's auth.uid(), so
  -- is_admin() is still true here and the legitimate path passes.
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A vendor submitting a document never gets to say it was reviewed.
    new.verified         := false;
    new.rejection_reason := null;
    new.reviewed_at      := null;
    new.reviewed_by      := null;
    return new;
  end if;

  if new.verified         is distinct from old.verified
  or new.rejection_reason is distinct from old.rejection_reason
  or new.reviewed_at      is distinct from old.reviewed_at
  or new.reviewed_by      is distinct from old.reviewed_by then
    raise exception 'not authorized: only an admin may change KYC review fields';
  end if;
  -- AR-H03: what was reviewed stays what was reviewed. A replacement is a new row.
  if new.file_url is distinct from old.file_url
  or new.doc_type is distinct from old.doc_type
  or new.detail   is distinct from old.detail then
    raise exception 'a submitted document can''t be changed; upload a new one instead' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ── AR-H05 ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_support_claim(p_ticket_id uuid, p_take_over boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_t    public.support_tickets;
  v_prev uuid;
begin
  perform admin.support_require_write();
  v_t := admin.support_lock_ticket(p_ticket_id, false);
  select s.assignee_id into v_prev from public.support_ticket_staff s where s.ticket_id = v_t.id;
  -- AR-H05: a request a colleague holds moves only when the claimer says so.
  if v_prev is not null and v_prev <> auth.uid() and not coalesce(p_take_over, false) then
    raise exception 'Another staff member has this request.' using errcode = 'P0001', hint = 'held_by_other';
  end if;
  update public.support_ticket_staff set assignee_id = auth.uid(), assigned_at = now(), updated_at = now()
   where ticket_id = v_t.id;
  perform admin.support_event(v_t.id, 'claimed', null, null,
    case when v_prev is not null and v_prev <> auth.uid() then jsonb_build_object('took_over_from', v_prev)
         else '{}'::jsonb end);
  if v_t.status = 'new' then
    update public.support_tickets set status = 'open' where id = v_t.id;
    perform admin.support_event(v_t.id, 'status', 'new', 'open', '{}'::jsonb);
  end if;
  -- The requester sees the team, never a person (D-06), and only once.
  if v_t.channel = 'chat' and not exists (select 1 from public.support_messages m
                                           where m.ticket_id = v_t.id and m.event = 'joined') then
    perform admin.support_system_message(v_t.id, 'joined', 'Cosora Support has joined the chat.', '{}'::jsonb, 'public');
  end if;
  return jsonb_build_object('assignee_id', auth.uid(), 'status', case when v_t.status = 'new' then 'open' else v_t.status end);
end
$function$;
revoke all on function public.admin_support_claim(uuid, boolean) from public, anon;
grant execute on function public.admin_support_claim(uuid, boolean) to authenticated;

-- The one-argument form (an open tab still on the old panel) never takes over.
create or replace function public.admin_support_claim(p_ticket_id uuid)
 returns jsonb
 language sql
 security definer
 set search_path to ''
as $function$
  select public.admin_support_claim(p_ticket_id, false)
$function$;

-- ── AR-H08 ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function admin.keyword_breadth_problem(p_term text)
 returns text
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  -- The ordinary messages admin.flag_pattern_breadth_problem tests patterns against. A blocked term refuses the
  -- message outright (check_message_blocklist matches anywhere in it), so one ordinary hit is already too many.
  v_samples text[] := array[
    'Hi, is this still available?',
    'What is the MOQ for this fabric?',
    'Please share your best price for 500 metres.',
    'Can you send samples to Delhi?',
    'Thank you, I will confirm by Monday.',
    'Do you have this in navy blue?',
    'What is the lead time for 2000 pieces?',
    'Okay',
    'Namaste ji, rate kya hai?',
    'The GSM should be around 180.',
    'Payment will be done after inspection.',
    'Sending the tech pack now.'];
  v_term text := lower(btrim(coalesce(p_term, '')));
  s text;
begin
  if length(v_term) < 3 then
    return 'A blocked term needs at least 3 characters: shorter ones turn up inside ordinary words.';
  end if;
  if length(v_term) > 100 then
    return 'A blocked term can be at most 100 characters.';
  end if;
  foreach s in array v_samples loop
    if strpos(lower(s), v_term) > 0 then
      return format('"%s" appears in ordinary business messages (for example "%s"), so blocking it would stop normal chats. Use a longer, more specific term, or a flag pattern.',
                    btrim(p_term), s);
    end if;
  end loop;
  return null;
end
$function$;
revoke all on function admin.keyword_breadth_problem(text) from public, anon, authenticated;

create or replace function public.admin_keyword_add(p_term text)
 returns table(id uuid, term text, added_by uuid, created_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_id      uuid;
  v_problem text;
begin
  -- Gate = keyword_blocklist_insert WITH CHECK (S)
  if not coalesce(public.is_admin() and public.admin_role() = any (array['support','super_admin']::public.admin_role_type[]), false) then
    raise exception 'Adding to the keyword blocklist requires the support or super_admin role'
      using errcode = '42501';
  end if;
  -- AR-H08: one short or common term would refuse ordinary messages for everyone.
  v_problem := admin.keyword_breadth_problem(p_term);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023', hint = 'too_broad';
  end if;

  insert into admin.keyword_blocklist as k (term, added_by)
  values (btrim(p_term), auth.uid())
  returning k.id into v_id;

  return query
    select k.id, k.term, k.added_by, k.created_at
      from admin.keyword_blocklist k
     where k.id = v_id;
end
$function$;

-- ── AR-H09 ────────────────────────────────────────────────────────────────────────────────────────────────────
create index if not exists vendor_profiles_brand_sort_idx
  on public.vendor_profiles (lower(coalesce(brand_name, '')), id);

create or replace function public.admin_vendor_list(
  p_search      text    default null,
  p_onboarding  text    default 'all',
  p_after_brand text    default null,
  p_after_id    uuid    default null,
  p_limit       integer default 50)
 returns table(id uuid, brand_name text, city text, business_type text, gstin text, onboarding_complete boolean,
               is_verified boolean, account_status text, plan_id text, plan_expires_at timestamptz,
               ad_verified_until timestamptz, sort_key text)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_q     text := nullif(btrim(coalesce(p_search, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  -- The Vendors page's readers (Cosora-Admin roles.ts SECTION_READ.vendors).
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'vendor_ops', 'support'), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(v_q) > 100 then
    raise exception 'A search can be at most 100 characters.' using errcode = '22023';
  end if;
  if coalesce(p_onboarding, 'all') not in ('all', 'complete', 'incomplete') then
    raise exception 'unknown onboarding filter' using errcode = '22023';
  end if;
  -- Literal search: escape LIKE's own characters.
  v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select v.id, v.brand_name, v.city, v.business_type, v.gstin, coalesce(v.onboarding_complete, false),
           coalesce(v.is_verified, false), p.account_status::text, v.plan_id, v.plan_expires_at,
           v.ad_verified_until, lower(coalesce(v.brand_name, ''))
      from public.vendor_profiles v
      join public.profiles p on p.id = v.id
     where (v_q is null or v.brand_name ilike '%' || v_q || '%' or v.city ilike '%' || v_q || '%'
            or v.gstin ilike '%' || v_q || '%')
       and (coalesce(p_onboarding, 'all') = 'all'
            or (p_onboarding = 'complete' and coalesce(v.onboarding_complete, false))
            or (p_onboarding = 'incomplete' and not coalesce(v.onboarding_complete, false)))
       and (p_after_brand is null
            or (lower(coalesce(v.brand_name, '')), v.id) > (p_after_brand, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
     order by lower(coalesce(v.brand_name, '')), v.id
     limit v_limit;
end
$function$;
revoke all on function public.admin_vendor_list(text, text, text, uuid, integer) from public, anon;
grant execute on function public.admin_vendor_list(text, text, text, uuid, integer) to authenticated;

-- ── AR-H10 ────────────────────────────────────────────────────────────────────────────────────────────────────
-- A listing's revision moves whenever its content changes: its own columns (not its status, the moderator's note or
-- counters the system keeps), or its photos and PDFs. Kept in its own table so a photo change doesn't have to touch
-- the listing row (which would fire every trigger on products).
create table if not exists admin.listing_revs (
  listing_kind text   not null check (listing_kind in ('product', 'video', 'catalogue')),
  listing_id   uuid   not null,
  rev          bigint not null default 1,
  changed_at   timestamptz not null default now(),
  primary key (listing_kind, listing_id)
);
alter table admin.listing_revs enable row level security;
revoke all on admin.listing_revs from public, anon, authenticated;

create or replace function admin.listing_rev_bump(p_kind text, p_id uuid)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  insert into admin.listing_revs as r (listing_kind, listing_id) values (p_kind, p_id)
  on conflict (listing_kind, listing_id) do update set rev = r.rev + 1, changed_at = now();
$function$;
revoke all on function admin.listing_rev_bump(text, uuid) from public, anon, authenticated;

create or replace function admin.trg_listing_rev()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_kind text := case tg_table_name when 'products' then 'product' when 'product_videos' then 'video' else 'catalogue' end;
  -- Not content: the decision, the moderator's notes, and what the system keeps on its own.
  v_skip text[] := array['status', 'rejection_reason', 'rating_avg', 'reviews_count', 'sold_count', 'enquiries_count',
                         'views_count', 'likes_count', 'rating', 'reviews', 'embedding', 'fts', 'search_text',
                         'paused_at', 'paused_from', 'removed_at', 'removed_reason', 'flagged_at', 'flag_reason',
                         'category_name'];
begin
  if tg_op = 'INSERT' or (to_jsonb(new) - v_skip) is distinct from (to_jsonb(old) - v_skip) then
    perform admin.listing_rev_bump(v_kind, new.id);
  end if;
  return null;
end
$function$;

create or replace function admin.trg_listing_rev_files()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform admin.listing_rev_bump('product', coalesce(new.product_id, old.product_id));
  return null;
end
$function$;

drop trigger if exists trg_products_listing_rev on public.products;
create trigger trg_products_listing_rev after insert or update on public.products
  for each row execute function admin.trg_listing_rev();
drop trigger if exists trg_product_videos_listing_rev on public.product_videos;
create trigger trg_product_videos_listing_rev after insert or update on public.product_videos
  for each row execute function admin.trg_listing_rev();
drop trigger if exists trg_catalogues_listing_rev on public.catalogues;
create trigger trg_catalogues_listing_rev after insert or update on public.catalogues
  for each row execute function admin.trg_listing_rev();
drop trigger if exists trg_product_images_listing_rev on public.product_images;
create trigger trg_product_images_listing_rev after insert or update or delete on public.product_images
  for each row execute function admin.trg_listing_rev_files();
drop trigger if exists trg_product_documents_listing_rev on public.product_documents;
create trigger trg_product_documents_listing_rev after insert or update or delete on public.product_documents
  for each row execute function admin.trg_listing_rev_files();

-- Revisions of the listings a queue shows (0 = unchanged since before revisions were kept).
create or replace function public.admin_listing_revs(p_kind text, p_ids uuid[])
 returns table(listing_id uuid, rev bigint)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then
    raise exception 'Up to 500 ids.' using errcode = '22023';
  end if;
  return query
    select i.id, coalesce(r.rev, 0)
      from unnest(p_ids) as i(id)
      left join admin.listing_revs r on r.listing_kind = p_kind and r.listing_id = i.id;
end
$function$;
revoke all on function public.admin_listing_revs(text, uuid[]) from public, anon;
grant execute on function public.admin_listing_revs(text, uuid[]) to authenticated;

-- A moderator's decision on a listing, applied only if it still has the status AND the content they were shown.
-- SECURITY INVOKER on purpose: the update runs as the moderator, so every moderation trigger and policy decides as
-- before (role, reason required, plan caps); this adds the revision check in the same transaction.
create or replace function public.admin_listing_decide(
  p_kind text, p_id uuid, p_from text, p_to text, p_reason text, p_rev bigint)
 returns jsonb
 language plpgsql
 security invoker
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_table text := case p_kind when 'product' then 'products' when 'video' then 'product_videos'
                              when 'catalogue' then 'catalogues' end;
  v_rev   bigint;
  v_now   text;
  v_n     integer;
begin
  if v_table is null then
    raise exception 'unknown listing kind %', p_kind using errcode = '22023';
  end if;
  -- Lock the listing first, so a seller's edit can't land between the check and the decision.
  execute format('select status::text from public.%I where id = $1 for update', v_table) into v_now using p_id;
  if v_now is null then
    raise exception 'This listing no longer exists.' using errcode = 'P0002', hint = 'gone';
  end if;
  if v_now <> p_from then
    return jsonb_build_object('ok', false, 'status', v_now);
  end if;
  select r.rev into v_rev from public.admin_listing_revs(p_kind, array[p_id]) r;
  if p_rev is not null and coalesce(v_rev, 0) <> p_rev then
    raise exception 'The seller changed this listing after you opened it. Look at it again before deciding.'
      using errcode = 'P0001', hint = 'changed_since_loaded';
  end if;
  execute format('update public.%I set status = $1::public.product_status, rejection_reason = $2 where id = $3 and status::text = $4',
                 v_table)
    using p_to, p_reason, p_id, p_from;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    -- RLS refused the write (a role that may not moderate this table): say so, never report success.
    raise exception 'not authorized to change this listing' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true, 'status', p_to);
end
$function$;
revoke all on function public.admin_listing_decide(text, uuid, text, text, text, bigint) from public, anon;
grant execute on function public.admin_listing_decide(text, uuid, text, text, text, bigint) to authenticated;

-- ── AR-H11 ────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function admin.notify_moderation_outcome()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row    jsonb := to_jsonb(new);
  v_what   text;
  v_kind   text;
  v_name   text;
  v_reason text;
begin
  if new.status::text is not distinct from old.status::text or not coalesce(public.is_admin(), false) then
    return null;
  end if;
  if tg_table_name = 'products' then
    if new.removed_at is not null then
      return null; -- admin_product_remove sends its own notice
    end if;
    v_what := 'listing';   v_kind := 'product';   v_name := v_row ->> 'name';
  elsif tg_table_name = 'catalogues' then
    v_what := 'catalogue'; v_kind := 'catalogue'; v_name := v_row ->> 'title';
  else
    v_what := 'video';     v_kind := 'video';     v_name := v_row ->> 'brand_line';
  end if;
  v_name := case when nullif(btrim(v_name), '') is null then '' else '"' || btrim(v_name) || '"' end;

  -- AR-H11: a moderator overturning a rejection is an approval too, and the seller hears of it.
  if new.status::text = 'live' and old.status::text in ('under_review', 'rejected') then
    perform public.notify(new.vendor_id, v_kind || '_approved', 'Your ' || v_what || ' is live',
      case when v_name = '' then 'It passed review. Buyers can see it now.'
           else v_name || ' passed review. Buyers can see it now.' end);
  elsif new.status::text = 'rejected' then
    v_reason := coalesce(nullif(btrim(v_row ->> 'rejection_reason'), ''), 'No reason was given.');
    perform public.notify(new.vendor_id, v_kind || '_rejected', 'Your ' || v_what || ' wasn''t approved',
      case when v_name = '' then '' else v_name || ': ' end || v_reason || ' Edit it and send it for review again.');
  end if;
  return null;
end
$function$;

-- ── AR-H12 ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Every figure here already required a new or open request (awaiting_staff includes it). Saying so up front lets the
-- planner use support_tickets_queue_idx and skip the per-request message aggregates of every closed request.
create or replace function public.admin_support_counts()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v jsonb;
begin
  perform admin.support_require_read();
  select jsonb_build_object(
           'awaiting',          count(*) filter (where r.awaiting_staff),
           'awaiting_chat',     count(*) filter (where r.awaiting_staff and r.channel = 'chat'),
           'awaiting_callback', count(*) filter (where r.awaiting_staff and r.channel = 'callback'),
           'awaiting_fraud',    count(*) filter (where r.awaiting_staff and r.channel = 'fraud_report'),
           'awaiting_feedback', count(*) filter (where r.awaiting_staff and r.channel = 'feedback'),
           'awaiting_priority', count(*) filter (where r.awaiting_staff and admin.support_requester_priority(r.requester_id, r.requester_side) > 0),
           'active',            count(*),
           'mine',              count(*) filter (where r.assignee_id = auth.uid()),
           'unassigned',        count(*) filter (where r.assignee_id is null),
           'callbacks_today',   count(*) filter (where r.channel = 'callback' and r.callback_outcome = 'pending'
                                                   and r.preferred_date = v_today),
           'callbacks_overdue', count(*) filter (where r.channel = 'callback' and r.callback_outcome = 'pending'
                                                   and (r.preferred_date + r.window_end) at time zone 'Asia/Kolkata' < now()),
           -- A callback booked for later is waiting, but not yet late: leave it out.
           'oldest_waiting_at', min(r.waiting_at) filter (where r.awaiting_staff and r.waiting_at <= now()),
           'open_now',          admin.support_is_open_at(now()),
           'rollout',           (select s.rollout from public.support_settings s where s.singleton))
    into v
    from admin.support_ticket_rows r
   where r.status in ('new', 'open');
  return v;
end
$function$;

-- ── Self-checks ───────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendor_documents' and cmd = 'UPDATE') then
    raise exception 'self-check: vendor_documents still has an UPDATE policy';
  end if;
  if admin.keyword_breadth_problem('hi') is null or admin.keyword_breadth_problem('rate') is null
     or admin.keyword_breadth_problem('paytm me directly') is not null then
    raise exception 'self-check: keyword_breadth_problem misjudges';
  end if;
  if position('credit_rupees'')::integer, 0) < coalesce(o.credit_rupees, 0)'
              in pg_get_functiondef('public.subscription_fulfil(text,text,text)'::regprocedure)) = 0 then
    raise exception 'self-check: subscription_fulfil was not patched';
  end if;
  if position('''under_review'', ''rejected''' in pg_get_functiondef('admin.notify_moderation_outcome()'::regprocedure)) = 0 then
    raise exception 'self-check: notify_moderation_outcome was not updated';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.admin_listing_decide(text,uuid,text,text,text,bigint)'::regprocedure) then
    raise exception 'self-check: admin_listing_decide must be SECURITY INVOKER';
  end if;
end
$$;

commit;
