-- Cosora-Admin review 2026-11-22, High batch 1, the money half (documentation/admin-review-high-fixes-plan-2026-11-22.md):
--   AR-H13 totals count live money only; test and demo money is shown on its own line (Mitra: "Exclude, show
--          separately"). Ad orders now say which money they were: every existing one is test money (no live Razorpay
--          key has ever been set; securityflags 2026-10-11), and razorpay-create-order records it from now on.
--   AR-H15 a paid ad order can be refunded through Razorpay from Cosora-Admin (Mitra: "Refund through Razorpay"):
--          refund columns on ad_orders, a claim and a record for admin-refund-payment, refund webhooks matched by
--          the refund id, "no refund needed" for finance, and a rejected or suspended paid campaign flags its order.
--   AR-H14 credit notes are read by finance and the seller through the existing policy; the PDF is drawn by
--          invoice-render into the private invoices bucket (pdf_path).

begin;

-- ── ad_orders: money mode and refunds ─────────────────────────────────────────────────────────────────────────
alter table public.ad_orders
  add column if not exists payment_mode        text,
  add column if not exists razorpay_payment_id text,
  add column if not exists refund_status       text,
  add column if not exists razorpay_refund_id  text,
  add column if not exists refunded_paise      bigint,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refunded_at         timestamptz,
  add column if not exists refund_note         text;

update public.ad_orders set payment_mode = 'test' where payment_mode is null;

alter table public.ad_orders drop constraint if exists ad_orders_payment_mode_check;
alter table public.ad_orders add constraint ad_orders_payment_mode_check
  check (payment_mode is null or payment_mode in ('live', 'test', 'demo', 'free'));
alter table public.ad_orders drop constraint if exists ad_orders_refund_status_check;
alter table public.ad_orders add constraint ad_orders_refund_status_check
  check (refund_status is null or refund_status in ('pending', 'processed', 'failed'));
alter table public.ad_orders drop constraint if exists ad_orders_status_check;
alter table public.ad_orders add constraint ad_orders_status_check
  check (status in ('created', 'paid', 'failed', 'refund_review', 'refunded'));
create index if not exists ad_orders_refund_review_idx on public.ad_orders (created_at) where status = 'refund_review';
create index if not exists ad_orders_refund_id_idx on public.ad_orders (razorpay_refund_id) where razorpay_refund_id is not null;

-- Only the payment functions and definer functions write orders; browsers had grants RLS never used.
revoke insert, update, delete on public.ad_orders from anon, authenticated;

-- Finance and the edge function refund through these two, in order: claim (one refund at a time), then record what
-- Razorpay answered.
create or replace function public.ad_order_refund_claim(p_order_id text, p_amount_paise bigint, p_note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  o public.ad_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ad_order_refund_claim is for the payment functions only' using errcode = '42501';
  end if;
  select * into o from public.ad_orders where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_order');
  end if;
  if o.status not in ('paid', 'refund_review') then
    return jsonb_build_object('ok', false, 'reason', 'not_paid', 'status', o.status);
  end if;
  if o.refund_status in ('pending', 'processed') then
    return jsonb_build_object('ok', false, 'reason', 'already', 'refund_status', o.refund_status);
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > o.amount then
    return jsonb_build_object('ok', false, 'reason', 'bad_amount', 'max_paise', o.amount);
  end if;
  update public.ad_orders
     set refund_status = 'pending', refund_requested_at = now(), refunded_paise = p_amount_paise,
         refund_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where order_id = o.order_id;
  return jsonb_build_object('ok', true, 'vendor_id', o.vendor_id, 'amount_paise', o.amount,
                            'payment_mode', o.payment_mode, 'razorpay_payment_id', o.razorpay_payment_id);
end
$function$;

create or replace function public.ad_order_refund_record(
  p_order_id text, p_payment_ref text, p_refund_ref text, p_status text, p_amount_paise bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  o public.ad_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ad_order_refund_record is for the payment functions only' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'processed', 'failed') then
    raise exception 'unknown refund status %', p_status using errcode = '22023';
  end if;
  select * into o from public.ad_orders where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_order');
  end if;
  update public.ad_orders
     set refund_status = p_status,
         razorpay_payment_id = coalesce(p_payment_ref, razorpay_payment_id),
         razorpay_refund_id = coalesce(p_refund_ref, razorpay_refund_id),
         refunded_paise = coalesce(p_amount_paise, refunded_paise),
         refunded_at = case when p_status = 'processed' then coalesce(refunded_at, now()) else refunded_at end,
         status = case when p_status = 'processed' then 'refunded' else status end
   where order_id = o.order_id;
  if p_status = 'processed' and o.refund_status is distinct from 'processed' then
    perform public.notify(o.vendor_id, 'refund_processed', 'Your ad payment was refunded',
      format('We refunded ₹%s for an ad order. A refund usually reaches your account in 5–7 working days.',
             to_char(coalesce(p_amount_paise, o.refunded_paise, o.amount) / 100.0, 'FM99,99,99,990.00')),
      null);
  end if;
  return jsonb_build_object('ok', true);
end
$function$;
revoke all on function public.ad_order_refund_claim(text, bigint, text) from public, anon, authenticated;
revoke all on function public.ad_order_refund_record(text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.ad_order_refund_claim(text, bigint, text) to service_role;
grant execute on function public.ad_order_refund_record(text, text, text, text, bigint) to service_role;

-- Refund webhooks: an ad order is matched by its refund id once the plan invoices didn't match.
create or replace function public.subscription_refund_event(p_payment_ref text, p_refund_ref text, p_status text, p_amount_paise bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id    uuid;
  v_order text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_refund_event is for the payment functions only' using errcode = '42501';
  end if;
  if p_status = 'processed' then
    -- A refund of the whole charge makes the invoice refunded, as admin-refund-payment does.
    update public.subscription_invoices
       set refund_status = 'processed', razorpay_refund_id = p_refund_ref,
           refunded_amount = coalesce(p_amount_paise, refunded_amount)::integer, refunded_at = coalesce(refunded_at, now()),
           status = case when coalesce(p_amount_paise, refunded_amount, 0)
                              >= coalesce(total_paise, (amount::bigint + coalesce(gst_amount, 0)) * 100)
                         then 'refunded' else status end
     where razorpay_payment_id = p_payment_ref
       and (refund_status is distinct from 'processed')
       and (razorpay_refund_id is null or razorpay_refund_id = p_refund_ref)
    returning id into v_id;
  elsif p_status = 'failed' then
    update public.subscription_invoices
       set refund_status = 'failed'
     where razorpay_payment_id = p_payment_ref and razorpay_refund_id = p_refund_ref and refund_status = 'pending'
    returning id into v_id;
  else
    raise exception 'unknown refund status %', p_status using errcode = '22023';
  end if;
  if v_id is not null then
    return jsonb_build_object('matched', true, 'invoice_id', v_id);
  end if;
  -- AR-H15: an ad order refunded from Cosora-Admin.
  select o.order_id into v_order from public.ad_orders o
   where o.razorpay_refund_id = p_refund_ref
      or (o.razorpay_payment_id = p_payment_ref and o.refund_status = 'pending')
   limit 1;
  if v_order is not null then
    if p_status = 'processed' or exists (select 1 from public.ad_orders o where o.order_id = v_order and o.refund_status = 'pending') then
      perform public.ad_order_refund_record(v_order, p_payment_ref, p_refund_ref, p_status, p_amount_paise);
    end if;
    return jsonb_build_object('matched', true, 'ad_order_id', v_order);
  end if;
  return jsonb_build_object('matched', false, 'invoice_id', null);
end
$function$;

-- Finance decides a flagged order needs no refund (the campaign was fixed and approved, or Cosora keeps the money).
create or replace function public.admin_ad_order_resolve(p_order_id text, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: ad refunds are for super admins and finance' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why no refund is needed.' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', left(btrim(p_note), 500), true);
  update public.ad_orders set status = 'paid', refund_note = left(btrim(p_note), 500)
   where order_id = p_order_id and status = 'refund_review';
  if not found then
    raise exception 'This order isn''t waiting for a refund decision.' using errcode = 'P0001';
  end if;
  perform set_config('cosora.audit_reason', '', true);
end
$function$;
revoke all on function public.admin_ad_order_resolve(text, text) from public, anon;
grant execute on function public.admin_ad_order_resolve(text, text) to authenticated;

-- ad_orders had no Admin Log trigger; refunds and resolutions are admin actions.
drop trigger if exists trg_admin_audit on public.ad_orders;
create trigger trg_admin_audit after insert or update or delete on public.ad_orders
  for each row execute function admin.audit_row_change('vendor_id');

-- A paid campaign rejected or suspended by Cosora flags its order, so finance decides on a refund.
create or replace function admin.trg_ad_paid_campaign_stopped()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.ad_order_id is not null and new.status in ('rejected', 'suspended')
     and old.status is distinct from new.status and coalesce(public.is_admin(), false) then
    update public.ad_orders set status = 'refund_review' where order_id = new.ad_order_id and status = 'paid';
  end if;
  return null;
end
$function$;
drop trigger if exists trg_advertisements_paid_stopped on public.advertisements;
create trigger trg_advertisements_paid_stopped after update of status on public.advertisements
  for each row execute function admin.trg_ad_paid_campaign_stopped();

-- ── Credit notes (AR-H14) ─────────────────────────────────────────────────────────────────────────────────────
alter table public.subscription_credit_notes add column if not exists pdf_path text;

-- ── The ledger (AR-H13, AR-H15) ───────────────────────────────────────────────────────────────────────────────
-- Same rows as before, plus each row's money mode and ad refunds as their own rows.
create or replace view admin.payment_entries as
 SELECT 'invoice:'::text || i.id::text AS entry_key,
    i.created_at AS occurred_at,
    'subscription'::text AS kind,
    i.status,
    i.vendor_id,
    COALESCE(i.invoice_number, i.id::text) AS reference,
    (COALESCE(sp.name, i.plan_id) || ' plan · '::text) ||
        CASE
            WHEN (i.billing_period_end - i.billing_period_start) >= '360 days'::interval THEN 'yearly'::text
            ELSE 'monthly'::text
        END AS detail,
    i.amount::bigint * 100 AS net_paise,
    COALESCE(i.gst_amount, 0)::bigint * 100 AS gst_paise,
    (i.amount + COALESCE(i.gst_amount, 0))::bigint * 100 AS total_paise,
    i.razorpay_payment_id AS gateway_ref,
    i.razorpay_payment_id IS NOT NULL OR (i.amount + COALESCE(i.gst_amount, 0)) = 0 AS verified,
    false AS includes_certificate,
    'subscription_invoices'::text AS source_table,
    i.id::text AS source_id,
    COALESCE(i.discount_amount, 0)::bigint * 100 AS discount_paise,
    i.discount_code,
    COALESCE(i.payment_mode, CASE WHEN i.razorpay_payment_id IS NULL THEN 'demo' ELSE 'test' END) AS payment_mode
   FROM subscription_invoices i
     LEFT JOIN subscription_plans sp ON sp.id = i.plan_id
UNION ALL
 SELECT 'refund:'::text || i.id::text AS entry_key,
    COALESCE(i.refunded_at, i.refund_requested_at, i.created_at) AS occurred_at,
    'refund'::text AS kind,
        CASE i.refund_status
            WHEN 'processed'::text THEN 'refunded'::text
            WHEN 'failed'::text THEN 'failed'::text
            ELSE 'pending'::text
        END AS status,
    i.vendor_id,
    COALESCE(i.invoice_number, i.id::text) AS reference,
    'Refund of '::text || COALESCE(i.invoice_number, 'an invoice'::text) AS detail,
    NULL::bigint AS net_paise,
    NULL::bigint AS gst_paise,
    - COALESCE(i.refunded_amount::bigint, (i.amount + COALESCE(i.gst_amount, 0))::bigint * 100) AS total_paise,
    i.razorpay_refund_id AS gateway_ref,
    i.razorpay_refund_id IS NOT NULL AS verified,
    false AS includes_certificate,
    'subscription_invoices'::text AS source_table,
    i.id::text AS source_id,
    NULL::bigint AS discount_paise,
    NULL::text AS discount_code,
    COALESCE(i.payment_mode, CASE WHEN i.razorpay_payment_id IS NULL THEN 'demo' ELSE 'test' END) AS payment_mode
   FROM subscription_invoices i
  WHERE i.refund_status IS NOT NULL
UNION ALL
 SELECT 'intent:'::text || o.order_id AS entry_key,
    o.created_at AS occurred_at,
    'subscription'::text AS kind,
        CASE
            WHEN o.status = 'failed'::text THEN 'failed'::text
            WHEN o.created_at > (now() - '24:00:00'::interval) THEN 'pending'::text
            ELSE 'abandoned'::text
        END AS status,
    o.vendor_id,
    o.order_id AS reference,
    ((COALESCE(sp.name, o.plan_id) || ' plan · '::text) || o.billing_cycle) || ' · checkout'::text AS detail,
    NULL::bigint AS net_paise,
    NULL::bigint AS gst_paise,
    o.amount::bigint AS total_paise,
    o.order_id AS gateway_ref,
    false AS verified,
    false AS includes_certificate,
    'subscription_payment_orders'::text AS source_table,
    o.order_id AS source_id,
    o.discount_rupees::bigint * 100 AS discount_paise,
    o.discount_code,
    COALESCE(o.payment_mode, 'test') AS payment_mode
   FROM subscription_payment_orders o
     LEFT JOIN subscription_plans sp ON sp.id = o.plan_id
  WHERE o.status = ANY (ARRAY['created'::text, 'failed'::text])
UNION ALL
 SELECT 'ad:'::text || o.order_id AS entry_key,
    COALESCE(o.paid_at, o.created_at) AS occurred_at,
        CASE
            WHEN COALESCE(o.spec -> 'placementIds'::text, '[]'::jsonb) = '["verifiedCertificate"]'::jsonb THEN 'certificate'::text
            ELSE 'ad_purchase'::text
        END AS kind,
        CASE o.status
            WHEN 'paid'::text THEN 'paid'::text
            WHEN 'refunded'::text THEN 'paid'::text  -- the purchase happened; its refund is its own row
            WHEN 'refund_review'::text THEN 'review'::text
            WHEN 'failed'::text THEN 'failed'::text
            ELSE
            CASE
                WHEN o.created_at > (now() - '24:00:00'::interval) THEN 'pending'::text
                ELSE 'abandoned'::text
            END
        END AS status,
    o.vendor_id,
    o.order_id AS reference,
    (COALESCE(NULLIF(btrim(o.spec ->> 'campaignLabel'::text), ''::text), 'Ad campaign'::text) || ' · '::text) || COALESCE(( SELECT string_agg(p.value, ', '::text) AS string_agg
           FROM jsonb_array_elements_text(COALESCE(o.spec -> 'placementIds'::text, '[]'::jsonb)) p(value)), 'no placements'::text) AS detail,
    NULL::bigint AS net_paise,
    NULL::bigint AS gst_paise,
    o.amount::bigint AS total_paise,
    o.order_id AS gateway_ref,
    o.status = ANY (ARRAY['paid'::text, 'refund_review'::text, 'refunded'::text]) AS verified,
    COALESCE(o.spec -> 'placementIds'::text, '[]'::jsonb) ? 'verifiedCertificate'::text AS includes_certificate,
    'ad_orders'::text AS source_table,
    o.order_id AS source_id,
    o.discount_paise::bigint AS discount_paise,
    o.discount_code,
    COALESCE(o.payment_mode, 'test') AS payment_mode
   FROM ad_orders o
UNION ALL
 SELECT 'adrefund:'::text || o.order_id AS entry_key,
    COALESCE(o.refunded_at, o.refund_requested_at, o.created_at) AS occurred_at,
    'refund'::text AS kind,
        CASE o.refund_status
            WHEN 'processed'::text THEN 'refunded'::text
            WHEN 'failed'::text THEN 'failed'::text
            ELSE 'pending'::text
        END AS status,
    o.vendor_id,
    o.order_id AS reference,
    'Refund of ad order '::text || o.order_id AS detail,
    NULL::bigint AS net_paise,
    NULL::bigint AS gst_paise,
    - COALESCE(o.refunded_paise, o.amount::bigint) AS total_paise,
    o.razorpay_refund_id AS gateway_ref,
    o.razorpay_refund_id IS NOT NULL AS verified,
    false AS includes_certificate,
    'ad_orders'::text AS source_table,
    o.order_id AS source_id,
    NULL::bigint AS discount_paise,
    NULL::text AS discount_code,
    COALESCE(o.payment_mode, 'test') AS payment_mode
   FROM ad_orders o
  WHERE o.refund_status IS NOT NULL;

-- The summary: live money in the totals, test and demo money beside them (AR-H13).
create or replace function public.admin_payments_summary(
  p_kinds text[] default null, p_statuses text[] default null, p_from timestamptz default null,
  p_to timestamptz default null, p_vendor uuid default null, p_search text default null)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_search  text := nullif(btrim(p_search), '');
  v_like    text;
  v_vendors uuid[];
  v_result  jsonb;
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]), false) then
    raise exception 'not authorized: payments are for super admins, finance and support' using errcode = '42501';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_vendors := array(select v.id from public.vendor_profiles v where v.brand_name ilike v_like limit 500);
  end if;

  -- Paid totals use admin_report_summary()'s definitions (paid invoices by created_at, paid
  -- ad orders by paid_at), so the two pages agree over the same window. Refunds are shown
  -- beside them, not netted into them. Discounts are what paid rows didn't charge.
  -- AR-H13: totals are live money ('live', or a free ₹0 order); test and demo payments took no money.
  select jsonb_build_object(
           'generated_at',            now(),
           'entries',                 count(*),
           'paid',                    count(*) filter (where e.status = 'paid' and e.payment_mode in ('live', 'free')),
           'pending',                 count(*) filter (where e.status = 'pending'),
           'abandoned',               count(*) filter (where e.status = 'abandoned'),
           'failed',                  count(*) filter (where e.status = 'failed'),
           'review',                  count(*) filter (where e.status = 'review'),
           'refunds',                 count(*) filter (where e.kind = 'refund'),
           'paid_paise',              coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode in ('live', 'free')), 0),
           'subscriptions_net_paise', coalesce(sum(e.net_paise) filter (where e.status = 'paid' and e.kind = 'subscription' and e.payment_mode in ('live', 'free')), 0),
           'gst_paise',               coalesce(sum(e.gst_paise) filter (where e.status = 'paid' and e.kind = 'subscription' and e.payment_mode in ('live', 'free')), 0),
           'ads_paise',               coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind in ('ad_purchase', 'certificate') and e.payment_mode in ('live', 'free')), 0),
           'refunded_paise',          coalesce(-sum(e.total_paise) filter (where e.kind = 'refund' and e.status = 'refunded' and e.payment_mode in ('live', 'free')), 0),
           'review_paise',            coalesce(sum(e.total_paise) filter (where e.status = 'review'), 0),
           'test_paise',              coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode = 'test'), 0),
           'test',                    count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode = 'test'),
           'demo_paise',              coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode = 'demo'), 0),
           'demo',                    count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode = 'demo'),
           -- Kept for an open tab on the old panel: what isn't live money.
           'unverified_paise',        coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode not in ('live', 'free')), 0),
           'unverified',              count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode not in ('live', 'free')),
           'discounts_paise',         coalesce(sum(e.discount_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and e.payment_mode in ('live', 'free')), 0),
           'discounted',              count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and e.discount_paise > 0 and e.payment_mode in ('live', 'free')))
    into v_result
    from admin.payment_entries e
   where (p_kinds is null or e.kind = any (p_kinds))
     and (p_statuses is null or e.status = any (p_statuses))
     and (p_from is null or e.occurred_at >= p_from)
     and (p_to is null or e.occurred_at < p_to)
     and (p_vendor is null or e.vendor_id = p_vendor)
     and (v_search is null
          or e.vendor_id = any (v_vendors)
          or e.reference ilike v_like
          or e.gateway_ref ilike v_like
          or e.discount_code ilike v_like);
  return v_result;
end
$function$;

-- The ledger takes a money filter (AR-H13). A new argument list, so the old function goes first: two overloads
-- would make every call ambiguous.
drop function if exists public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, integer);
create or replace function public.admin_payments_ledger(
  p_kinds text[] default null, p_statuses text[] default null, p_from timestamptz default null,
  p_to timestamptz default null, p_vendor uuid default null, p_search text default null,
  p_cursor_at timestamptz default null, p_cursor_key text default null, p_limit integer default 50,
  p_modes text[] default null)
 returns table(entry_key text, occurred_at timestamptz, kind text, status text, vendor_id uuid, vendor_name text,
               vendor_city text, reference text, detail text, net_paise bigint, gst_paise bigint, total_paise bigint,
               gateway_ref text, verified boolean, includes_certificate boolean, source_table text, source_id text,
               discount_paise bigint, discount_code text, payment_mode text)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_limit   int  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_search  text := nullif(btrim(p_search), '');
  v_like    text;
  v_vendors uuid[];
begin
  if not coalesce(public.is_admin()
                  and public.admin_role() = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]), false) then
    raise exception 'not authorized: payments are for super admins, finance and support' using errcode = '42501';
  end if;
  if (p_cursor_at is null) <> (p_cursor_key is null) then
    raise exception 'a cursor needs both occurred_at and entry_key' using errcode = '22023';
  end if;
  if v_search is not null then
    -- The search is literal text: % and _ match themselves.
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_vendors := array(select v.id from public.vendor_profiles v where v.brand_name ilike v_like limit 500);
  end if;

  return query
    select e.entry_key, e.occurred_at, e.kind, e.status, e.vendor_id, v.brand_name, v.city,
           e.reference, e.detail, e.net_paise, e.gst_paise, e.total_paise, e.gateway_ref,
           e.verified, e.includes_certificate, e.source_table, e.source_id,
           e.discount_paise, e.discount_code, e.payment_mode
      from admin.payment_entries e
      left join public.vendor_profiles v on v.id = e.vendor_id
     where (p_kinds is null or e.kind = any (p_kinds))
       and (p_statuses is null or e.status = any (p_statuses))
       and (p_modes is null or e.payment_mode = any (p_modes))
       and (p_from is null or e.occurred_at >= p_from)
       and (p_to is null or e.occurred_at < p_to)
       and (p_vendor is null or e.vendor_id = p_vendor)
       and (v_search is null
            or e.vendor_id = any (v_vendors)
            or e.reference ilike v_like
            or e.gateway_ref ilike v_like
            or e.discount_code ilike v_like)
       and (p_cursor_at is null or (e.occurred_at, e.entry_key) < (p_cursor_at, p_cursor_key))
     order by e.occurred_at desc, e.entry_key desc
     limit v_limit;
end
$function$;
revoke all on function public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, integer, text[]) from public, anon;
grant execute on function public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, integer, text[]) to authenticated;

-- Reports: the same definitions, live money in the totals, test and demo beside them (AR-H13).
create or replace function public.admin_report_summary(p_from timestamptz default null, p_to timestamptz default null)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'not authorized: admins only' using errcode = '42501';
  end if;

  with
  prod as (
    select p.status::text as status, count(*)::int as n
      from public.products p
     group by 1),
  cats as (
    select coalesce(c.name, 'Uncategorised') as name, count(*)::int as n
      from public.products p
      left join public.categories c on c.id = p.category_id
     group by 1),
  inv_all as (
    select (i.created_at at time zone 'Asia/Kolkata')::date as day,
           coalesce(i.payment_mode, case when i.razorpay_payment_id is null then 'demo' else 'test' end) as mode,
           i.amount::bigint * 100 as net,
           coalesce(i.gst_amount, 0)::bigint * 100 as gst
      from public.subscription_invoices i
     where i.status = 'paid'
       and (p_from is null or i.created_at >= p_from)
       and (p_to is null or i.created_at < p_to)),
  inv as (
    select day, sum(net) filter (where mode in ('live', 'free')) as net,
                sum(gst) filter (where mode in ('live', 'free')) as gst,
                sum(net + gst) filter (where mode not in ('live', 'free')) as unverified
      from inv_all group by 1),
  ads_all as (
    select (coalesce(o.paid_at, o.created_at) at time zone 'Asia/Kolkata')::date as day,
           coalesce(o.payment_mode, 'test') as mode, o.amount::bigint as paise
      from public.ad_orders o
     where o.status in ('paid', 'refunded')
       and (p_from is null or coalesce(o.paid_at, o.created_at) >= p_from)
       and (p_to is null or coalesce(o.paid_at, o.created_at) < p_to)),
  ads as (
    select day, sum(paise) filter (where mode in ('live', 'free')) as paise,
                count(*) filter (where mode in ('live', 'free'))::int as n,
                sum(paise) filter (where mode not in ('live', 'free')) as other
      from ads_all group by 1),
  days as (
    select coalesce(inv.day, ads.day)   as day,
           coalesce(inv.net, 0)         as net,
           coalesce(inv.gst, 0)         as gst,
           coalesce(inv.unverified, 0) + coalesce(ads.other, 0) as unverified,
           coalesce(ads.paise, 0)       as ads
      from inv full join ads on ads.day = inv.day),
  plans as (
    select v.id,
           coalesce(v.brand_name, 'Unnamed vendor')                   as brand,
           coalesce(sp.name, v.plan_id)                               as plan,
           coalesce((sp.limits ->> 'search_boost_tier')::int, 0)      as boost,
           coalesce(v.plan_expires_at > now(), false)                 as active
      from public.vendor_profiles v
      left join public.subscription_plans sp on sp.id = v.plan_id
     where v.plan_id is not null
     order by 4 desc, 2
     limit 100)
  select jsonb_build_object(
    'generated_at', now(),
    'vendors', (select count(*) from public.vendor_profiles),
    'products_by_status', coalesce((select jsonb_agg(jsonb_build_object('status', status, 'count', n) order by n desc, status) from prod), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc, name) from cats), '[]'::jsonb),
    'revenue_by_day', coalesce((select jsonb_agg(jsonb_build_object(
        'day', day, 'subscriptions_net_paise', net, 'gst_paise', gst, 'ads_paise', ads, 'unverified_paise', unverified)
        order by day) from days), '[]'::jsonb),
    'totals', jsonb_build_object(
        'subscriptions_net_paise', coalesce((select sum(net) from inv), 0),
        'gst_paise',               coalesce((select sum(gst) from inv), 0),
        'ads_paise',               coalesce((select sum(paise) from ads), 0),
        'ad_orders',               coalesce((select sum(n) from ads), 0),
        -- What wasn't live money: test-key payments and demo activations.
        'unverified_paise',        coalesce((select sum(unverified) from inv), 0) + coalesce((select sum(other) from ads), 0),
        'test_paise',              coalesce((select sum(net + gst) from inv_all where mode = 'test'), 0)
                                   + coalesce((select sum(paise) from ads_all where mode = 'test'), 0),
        'demo_paise',              coalesce((select sum(net + gst) from inv_all where mode = 'demo'), 0)
                                   + coalesce((select sum(paise) from ads_all where mode = 'demo'), 0)),
    'vendors_on_plans', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'brand', brand, 'plan', plan, 'boost', boost, 'active', active)
        order by boost desc, brand) from plans), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

-- ── Self-checks ───────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.ad_orders where payment_mode is null) then
    raise exception 'self-check: an ad order has no money mode';
  end if;
  if has_table_privilege('authenticated', 'public.ad_orders', 'UPDATE') then
    raise exception 'self-check: browsers can still update ad_orders';
  end if;
  if has_function_privilege('authenticated', 'public.ad_order_refund_claim(text,bigint,text)', 'EXECUTE') then
    raise exception 'self-check: browsers can claim ad refunds';
  end if;
end
$$;

commit;
