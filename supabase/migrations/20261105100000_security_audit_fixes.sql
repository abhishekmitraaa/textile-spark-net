-- Security audit run-1 (2026-11-05), five medium findings (Mitra: "fix the F04, F03, F05, F06 and F07").
--
--   F04 A seller could insert a quote that was already 'accepted' (or shortlisted/rejected). The buyer-only
--       status rule (enforce_quote_update_roles) runs on UPDATE only, so the buyer saw an acceptance they never
--       gave and staff lead oversight marked the request won. A browser's new quote is now always pending.
--   F03 The listing cap was checked on the status the browser sent, before enforce_products_moderation turns
--       any non-draft status into under_review (triggers run in name order: _cap before _moderation). Sending
--       'rejected' or 'paused' skipped the cap and still queued a listing. Every non-draft insert now counts.
--   F05 The business-docs read policy let every staff role (is_admin()) list and sign every seller's KYC scans,
--       while vendor_documents and vendor_contracts admit only super_admin, vendor_ops and support. The
--       Storage policy now admits the same three roles.
--   F06 A PDF an approved listing uses (product_documents) could be deleted and uploaded again at the same path,
--       so buyers got unreviewed bytes from a live listing. product-files joins the 2026-10-21 rule (#3): a path
--       a row points at can't be created again. Deleting it still only breaks the link.
--   F07 subscription_fulfil activated whatever a fresh quote said, not what the order was priced for. Several
--       upgrade orders opened before paying all spent the same credit: the first upgraded, the rest became
--       full renewals (and ₹0 free_ orders needed no payment at all). Fulfilment now re-prices the order as of
--       its creation against today's subscription; if that now costs more than the order charged, a ₹0/demo
--       order is refused and a paid one opens an activation_failed incident (reason price_changed) for refund.
--       Re-pricing at the order's own creation time keeps a slow but genuine payment valid: nothing it relied
--       on has changed, so the price is the same. Two full-price orders still activate (the second is a
--       prepaid renewal at full price).
--
--   F02 call_buyer_contact gave a buyer's phone and name to any account with a quote on one of the buyer's
--       requirements, with no record and no limit. A quote anyone can insert on any open requirement (the lead
--       cap is off) and delete again, so every open requirement's buyer number could be collected. Now:
--       the caller must have finished seller registration (onboarding_complete, the checkout gate's test:
--       friction, not proof, as the column is the seller's own); every reveal is recorded in
--       admin.buyer_contact_reveals (kept 30 days, so deleting the quote erases nothing); a caller gets at most
--       30 different buyers an hour and 100 a day, as call_vendor_contact does for sellers; and a buyer's
--       number goes to at most 20 different callers a day, which holds however many accounts one person makes
--       (the dummy OTP stays on until real SMS exists, so accounts are free). A buyer already revealed to the
--       caller in the last day is served again without counting.
--
-- Pre-checks stop the file if any function or policy it replaces isn't the version it was written against
-- (prosrc md5 without carriage returns, and md5(USING || '|' || WITH CHECK); read on production and the local
-- stack on 2026-11-05). Harness: scripts/security/audit_2026_11_05.sql.

do $pin$
begin
  if (select string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, chr(13), '')), ', ' order by p.oid::regprocedure::text)
        from pg_proc p
       where p.oid in ('public.enforce_product_cap()'::regprocedure, 'public.storage_object_in_use(text,text)'::regprocedure,
                       'public.subscription_fulfil(text,text,text)'::regprocedure))
     is distinct from 'enforce_product_cap()=8eacc73b5aad931985288a864cc6162a, '
                   || 'storage_object_in_use(text,text)=dde8791b6ff4bf7bb72c993eb4507a76, '
                   || 'subscription_fulfil(text,text,text)=9c3719c850e98dd188f6ec80665c3407' then
    raise exception 'pre-check: enforce_product_cap, storage_object_in_use or subscription_fulfil is not the version this migration was written against';
  end if;
  if (select string_agg(polname || '=' || md5(coalesce(pg_get_expr(polqual, polrelid), '') || '|'
                                             || coalesce(pg_get_expr(polwithcheck, polrelid), '')), ', ' order by polname)
        from pg_policy
       where polrelid = 'storage.objects'::regclass and polname in ('business_docs_owner_select', 'product_files_owner_insert'))
     is distinct from 'business_docs_owner_select=cf360f14e201e529af91431c272fb80c, product_files_owner_insert=3d76646eda0541bfd9718c29566cf241' then
    raise exception 'pre-check: business_docs_owner_select or product_files_owner_insert is not the version this migration was written against';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_quotes_insert_status')
     or to_regprocedure('public.quotes_insert_status()') is not null then
    raise exception 'pre-check: quotes_insert_status already exists';
  end if;
  if md5(replace((select p.prosrc from pg_proc p where p.oid = 'public.call_buyer_contact(uuid)'::regprocedure), chr(13), ''))
     <> 'ad8133bebb54c22f1de02ea4573531cf' then
    raise exception 'pre-check: public.call_buyer_contact(uuid) is not the version this migration was written against';
  end if;
  if to_regclass('admin.buyer_contact_reveals') is not null then
    raise exception 'pre-check: admin.buyer_contact_reveals already exists';
  end if;
end
$pin$;

-- ── F04 ── a browser's new quote is pending ────────────────────────────────────────────────────────
create function public.quotes_insert_status()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- Shortlist, accept and reject are the buyer's (enforce_quote_update_roles, on UPDATE). A seller's new
  -- quote starts pending whatever status the browser sends. Definer functions and the service role pass.
  if current_user = 'authenticated' then
    new.status := 'pending';
  end if;
  return new;
end
$function$;

revoke execute on function public.quotes_insert_status() from public, anon, authenticated;

create trigger trg_quotes_insert_status
  before insert on public.quotes
  for each row execute function public.quotes_insert_status();

-- ── F03 ── the cap counts the status the row will get ──────────────────────────────────────────────
create or replace function public.enforce_product_cap()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  cap        integer;
  used       integer;
  eff_plan   text := 'free';
  adds_slot  boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Any non-draft insert takes a slot: enforce_products_moderation (which runs after this trigger)
    -- turns every other status a browser sends into under_review.
    adds_slot := new.status::text <> 'draft';
  else
    adds_slot := new.status::text in ('under_review', 'live')
                 and coalesce(old.status::text, '') not in ('under_review', 'live');
  end if;

  if not adds_slot then
    return new;
  end if;

  -- One cap check per vendor at a time. Without it, concurrent writes all
  -- count the same free slot (proven over HTTP: Master Prompt 12, Part E).
  perform pg_advisory_xact_lock(hashtext(new.vendor_id::text));

  -- With definer rights: a moderator approving a listing can't read the
  -- vendor's subscription (admin completion Phase 11).
  eff_plan := public.vendor_cap_plan(new.vendor_id);

  select coalesce((limits->>'product_cap')::int, -1)
    into cap
    from public.subscription_plans
   where id = eff_plan;

  cap := coalesce(cap, -1);

  if cap < 0 then
    return new;
  end if;

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
$function$;

-- ── F05 ── KYC scans: the owner and the KYC-reader roles only ──────────────────────────────────────
drop policy business_docs_owner_select on storage.objects;
create policy business_docs_owner_select on storage.objects
  for select
  using (bucket_id = 'business-docs'
         and ((storage.foldername(name))[1] = ((select auth.uid()))::text
              or ((select public.is_admin())
                  and (select public.admin_role()) = any (array['super_admin', 'vendor_ops', 'support']::public.admin_role_type[]))));

-- ── F06 ── a listing's PDF can't be uploaded again at its path ─────────────────────────────────────
create or replace function public.storage_object_in_use(p_bucket text, p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  with s as (select '/storage/v1/object/public/' || p_bucket || '/' || p_name as tail,
                    split_part(p_name, '/', 1) as owner)
  select case p_bucket
    when 'product-images' then exists (
      select 1 from public.product_images pi join public.products p on p.id = pi.product_id, s
       where right(pi.url, length(s.tail)) = s.tail and p.vendor_id::text = s.owner)
    when 'catalogues' then exists (
      select 1 from public.catalogues c, s
       where c.vendor_id::text = s.owner
         and (right(c.file_url, length(s.tail)) = s.tail or right(c.cover_url, length(s.tail)) = s.tail))
    when 'product-videos' then exists (
      select 1 from public.product_videos v, s
       where v.vendor_id::text = s.owner
         and (right(v.video_url, length(s.tail)) = s.tail or right(v.thumbnail_url, length(s.tail)) = s.tail))
    when 'product-files' then exists (
      select 1 from public.product_documents d join public.products p on p.id = d.product_id, s
       where d.path = p_name and p.vendor_id::text = s.owner)
    else false
  end
$function$;

drop policy product_files_owner_insert on storage.objects;
create policy product_files_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-files'
              and (storage.foldername(name))[1] = ((select auth.uid()))::text
              and name ~ '\.pdf$'
              and (select public.account_not_deleted((select auth.uid())))
              and not public.storage_object_in_use(bucket_id, name));

-- ── F07 ── an order activates only what it was priced for ──────────────────────────────────────────
create or replace function public.subscription_fulfil(p_order_ref text, p_payment_ref text, p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  o           public.subscription_payment_orders;
  v_plan      public.subscription_plans;
  v_entity    admin.billing_entity;
  v_has_entity boolean := false;
  a           jsonb;
  c           jsonb;
  q           jsonb;
  v_stale     boolean := false;
  v_list      integer;
  v_discount  integer;
  v_base      integer;
  v_gst_paise bigint;
  v_cgst      bigint := 0;
  v_sgst      bigint := 0;
  v_igst      bigint := 0;
  v_rec_gstin text;
  v_pos       text;
  v_supply    text;
  v_doc       text;
  v_number    text;
  v_supplier  jsonb;
  v_recipient jsonb;
  v_inv       uuid;
  v_incident  uuid;
  vp          record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_fulfil is for the payment functions only' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('verify', 'webhook', 'free', 'demo', 'reconcile') then
    raise exception 'unknown source %', p_source using errcode = '22023';
  end if;

  -- One fulfilment per order at a time: verify, the webhook and the reconciler can race.
  select * into o from public.subscription_payment_orders where order_id = p_order_ref for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_order');
  end if;
  if o.status <> 'created' then
    return jsonb_build_object('ok', o.status = 'paid', 'already', true, 'plan_id', o.plan_id,
      'invoice_id', (select i.id from public.subscription_invoices i where i.razorpay_order_id = p_order_ref order by i.created_at limit 1));
  end if;

  -- The order was priced when it was created. Re-price it as of then against the subscription as it is now:
  -- if another order has since used the credit it counted (or changed the plan), it now costs more than it
  -- charged, and activating it would give a full period for less (F07). Same lock as subscription_activate,
  -- so two orders of one vendor can't both pass this check before either activates.
  perform pg_advisory_xact_lock(hashtextextended('cosora.subscription:' || o.vendor_id::text, 0));
  if o.list_rupees is not null then
    q := admin.subscription_quote(o.vendor_id, o.plan_id, o.billing_cycle, o.created_at);
    v_stale := coalesce((q ->> 'ok')::boolean, false) and (q ->> 'charge_rupees')::integer > o.list_rupees;
  end if;

  -- A ₹0 order has no payment to prove it; its discount redemption is the proof, so it
  -- must confirm before anything is claimed.
  if o.amount = 0 then
    if o.discount_redemption_id is not null then
      c := public.discount_confirm(o.discount_redemption_id, p_order_ref);
      if not coalesce((c ->> 'ok')::boolean, false) then
        return jsonb_build_object('ok', false, 'reason', 'discount_unconfirmed');
      end if;
    elsif coalesce(o.list_rupees, -1) <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'not_free');
    end if;
  end if;

  update public.subscription_payment_orders
     set status = 'paid', paid_at = now(), payment_ref = p_payment_ref
   where order_id = p_order_ref;
  -- The vendor was charged the discounted price, so the code's use is theirs, even if
  -- the reservation lapsed while they paid.
  if o.amount > 0 and o.discount_redemption_id is not null then
    perform public.discount_confirm(o.discount_redemption_id, p_order_ref);
  end if;
  if o.payment_mode = 'live' then
    update admin.billing_settings set live_since = now() where live_since is null;
  end if;

  if v_stale then
    a := jsonb_build_object('ok', false, 'reason', 'price_changed');
  else
    a := public.subscription_activate(o.vendor_id, o.plan_id, o.billing_cycle);
  end if;
  if not coalesce((a ->> 'ok')::boolean, false) then
    if o.payment_mode in ('demo', 'free') then
      -- No money was taken: undo the claim and the code's confirmation together.
      raise exception 'activation refused: %', coalesce(a ->> 'reason', 'unknown') using errcode = 'P0001';
    end if;
    v_incident := admin.billing_incident_open('activation_failed', o.vendor_id, p_order_ref, p_payment_ref,
      jsonb_build_object('reason', a ->> 'reason', 'plan_id', o.plan_id, 'billing_cycle', o.billing_cycle,
                         'amount_paise', o.amount, 'source', p_source, 'payment_mode', o.payment_mode,
                         'quoted_now', q));
    return jsonb_build_object('ok', false, 'reason', 'activation_failed', 'detail', a ->> 'reason', 'incident_id', v_incident);
  end if;

  -- What the order charged, split into taxable value and GST. The order's amount was
  -- priced by the payment function with gstOn() (_shared/gst.ts); GST here is that
  -- amount less the taxable value, so there is no second GST formula.
  select * into v_plan from public.subscription_plans where id = o.plan_id;
  v_list := coalesce(o.list_rupees, case o.billing_cycle when 'yearly' then v_plan.yearly_price else v_plan.monthly_price end);
  v_discount := coalesce(o.discount_rupees, 0);
  v_base := v_list - v_discount;
  v_gst_paise := greatest(o.amount - v_base::bigint * 100, 0);

  select * into v_entity from admin.billing_entity;
  v_has_entity := found;
  select v.brand_name, v.owner_name, v.owner_email, v.address_line, v.area, v.landmark, v.city, v.state,
         v.state_code, v.postal_code, v.gstin
    into vp
    from public.vendor_profiles v where v.id = o.vendor_id;

  v_rec_gstin := upper(btrim(coalesce(nullif(btrim(o.gst_number), ''), vp.gstin, '')));
  if not public.gstin_is_valid(v_rec_gstin) then
    v_rec_gstin := null;
  end if;
  -- Place of supply: the recipient's GSTIN state, else its address state, else Cosora's.
  v_pos := coalesce((select s.code from public.india_states s where s.gst_code = substr(v_rec_gstin, 1, 2)),
                    vp.state_code,
                    case when v_has_entity then v_entity.state_code end);
  v_supply := case when not v_has_entity or v_pos is null or v_pos = v_entity.state_code then 'intra' else 'inter' end;
  if v_supply = 'intra' then
    v_cgst := v_gst_paise / 2;
    v_sgst := v_gst_paise - v_cgst;
  else
    v_igst := v_gst_paise;
  end if;

  v_doc := case o.payment_mode
             when 'demo' then 'demo'
             when 'test' then 'test'
             else case when v_has_entity then 'tax_invoice' else 'receipt' end
           end;
  v_number := admin.next_document_number(v_doc,
    case v_doc when 'tax_invoice' then v_entity.invoice_prefix when 'receipt' then 'RCT' when 'test' then 'TST' else 'DMO' end,
    now());

  if v_has_entity then
    v_supplier := jsonb_build_object(
      'legal_name', v_entity.legal_name, 'trade_name', v_entity.trade_name,
      'address', concat_ws(', ', v_entity.address_line1, v_entity.address_line2),
      'city', v_entity.city, 'state_code', v_entity.state_code,
      'state_name', (select s.name from public.india_states s where s.code = v_entity.state_code),
      'gst_state_code', (select s.gst_code from public.india_states s where s.code = v_entity.state_code),
      'postal_code', v_entity.postal_code, 'gstin', v_entity.gstin, 'pan', v_entity.pan,
      'email', v_entity.email, 'phone', v_entity.phone);
  end if;
  v_recipient := jsonb_build_object(
    'name', coalesce(nullif(btrim(vp.brand_name), ''), nullif(btrim(vp.owner_name), ''), 'Vendor'),
    'owner_name', vp.owner_name,
    'address', nullif(concat_ws(', ', nullif(btrim(vp.address_line), ''), nullif(btrim(vp.area), ''), nullif(btrim(vp.landmark), '')), ''),
    'city', vp.city, 'state', vp.state, 'state_code', vp.state_code,
    'gst_state_code', (select s.gst_code from public.india_states s where s.code = vp.state_code),
    'postal_code', vp.postal_code, 'gstin', v_rec_gstin, 'email', vp.owner_email);

  insert into public.subscription_invoices
    (vendor_id, subscription_id, plan_id, amount, currency, gst_amount, gst_number, tds_amount, status,
     razorpay_payment_id, razorpay_order_id, invoice_number, billing_period_start, billing_period_end,
     discount_amount, discount_code, change_kind, credit_rupees,
     payment_mode, document_type, supplier, recipient, place_of_supply, supply_type, sac_code,
     cgst_paise, sgst_paise, igst_paise, total_paise)
  values
    (o.vendor_id, (a ->> 'subscription_id')::uuid, o.plan_id, v_base, 'INR', (v_gst_paise / 100)::integer, o.gst_number, null, 'paid',
     p_payment_ref, p_order_ref, v_number, (a ->> 'period_start')::timestamptz, (a ->> 'period_end')::timestamptz,
     case when v_discount > 0 then v_discount end, case when v_discount > 0 then o.discount_code end,
     coalesce(o.change_kind, a ->> 'kind'), case when o.credit_rupees > 0 then o.credit_rupees end,
     o.payment_mode, v_doc, v_supplier, v_recipient, v_pos, v_supply, case when v_has_entity then v_entity.sac_code end,
     v_cgst, v_sgst, v_igst, o.amount)
  returning id into v_inv;

  if v_doc = 'receipt' and o.payment_mode = 'live' then
    perform admin.billing_incident_open('invoice_incomplete', o.vendor_id, p_order_ref, p_payment_ref,
      jsonb_build_object('invoice_id', v_inv, 'invoice_number', v_number,
                         'note', 'Set Cosora''s billing details, then issue a tax invoice for this payment.'));
  end if;

  return jsonb_build_object('ok', true, 'plan_id', o.plan_id, 'invoice_id', v_inv, 'invoice_number', v_number,
    'document_type', v_doc, 'kind', coalesce(o.change_kind, a ->> 'kind'),
    'period_start', a ->> 'period_start', 'period_end', a ->> 'period_end');
end
$function$;

-- ── F02 ── buyer numbers: registered sellers, recorded, limited per caller and per buyer ────────────
create table admin.buyer_contact_reveals (
  caller_id   uuid not null,
  buyer_id    uuid not null,
  revealed_at timestamptz not null default now()
);
create index buyer_contact_reveals_caller on admin.buyer_contact_reveals (caller_id, revealed_at);
create index buyer_contact_reveals_buyer on admin.buyer_contact_reveals (buyer_id, revealed_at);
alter table admin.buyer_contact_reveals enable row level security;
revoke all on admin.buyer_contact_reveals from public, anon, authenticated;

create or replace function public.call_buyer_contact(p_buyer_id uuid)
 returns table(phone text, full_name text)
 language plpgsql
 volatile security definer
 set search_path to ''
as $function$
declare
  v_me     uuid := auth.uid();
  v_seen   boolean;
  v_hour   int;
  v_day    int;
  v_buyer  int;
begin
  if v_me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_me and p.account_status = 'suspended') then
    raise exception 'caller_suspended' using errcode = '42501';
  end if;

  -- A seller who has finished registration, as subscription_checkout_gate asks.
  if not exists (select 1 from public.vendor_profiles v where v.id = v_me and v.onboarding_complete) then
    raise exception 'not_a_vendor' using errcode = '42501';
  end if;

  if p_buyer_id is null or not exists (
    select 1
    from public.quotes q
    join public.rfqs r on r.id = q.rfq_id
    where q.vendor_id = v_me
      and r.buyer_id = p_buyer_id
  ) then
    raise exception 'no_rfq_relationship' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = p_buyer_id and p.account_status = 'suspended') then
    raise exception 'target_suspended' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.conversations c
    where c.user_a = least(v_me, p_buyer_id)
      and c.user_b = greatest(v_me, p_buyer_id)
      and c.status = 'under_review'
  ) then
    raise exception 'under_review' using errcode = '42501';
  end if;

  -- A block either way (chat_blocks, 20261018160000) stops every way of reaching the other person.
  if public.chat_blocked_between(v_me, p_buyer_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  -- Every reveal is recorded; the limits count DIFFERENT buyers per caller and DIFFERENT callers per
  -- buyer. One lock per caller and one per buyer serialise concurrent requests, so parallel calls
  -- can't all read the same count.
  if v_me <> p_buyer_id then
    perform pg_advisory_xact_lock(hashtext('buyer_contact:' || v_me::text));
    perform pg_advisory_xact_lock(hashtext('buyer_contact_target:' || p_buyer_id::text));
    -- The caller's ledger keeps 30 days, for staff to look back on.
    delete from admin.buyer_contact_reveals r
     where r.caller_id = v_me and r.revealed_at <= now() - interval '30 days';
    select exists (select 1 from admin.buyer_contact_reveals r
                    where r.caller_id = v_me and r.buyer_id = p_buyer_id
                      and r.revealed_at > now() - interval '1 day')
      into v_seen;
    -- A buyer revealed to this caller in the last day is served again without counting.
    if not v_seen then
      select count(distinct r.buyer_id) filter (where r.revealed_at > now() - interval '1 hour'),
             count(distinct r.buyer_id) filter (where r.revealed_at > now() - interval '1 day')
        into v_hour, v_day
        from admin.buyer_contact_reveals r
       where r.caller_id = v_me;
      if v_hour >= 30 or v_day >= 100 then
        raise exception 'rate_limited' using errcode = '42501';
      end if;
      select count(distinct r.caller_id)
        into v_buyer
        from admin.buyer_contact_reveals r
       where r.buyer_id = p_buyer_id and r.revealed_at > now() - interval '1 day';
      if v_buyer >= 20 then
        raise exception 'buyer_limited' using errcode = '42501';
      end if;
      insert into admin.buyer_contact_reveals (caller_id, buyer_id) values (v_me, p_buyer_id);
    end if;
  end if;

  return query
    select p.phone, p.full_name
    from public.profiles p
    where p.id = p_buyer_id;
end;
$function$;
