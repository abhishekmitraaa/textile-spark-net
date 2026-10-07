-- Subscriptions P1: billing core (plan "build every vendor subscription feature", 2026-10-08).
--
-- 1. ONE fulfilment transaction: public.subscription_fulfil(order, payment, source). It
--    claims the payment intent, confirms its discount code, activates the plan, and issues
--    the invoice, together. The payment functions used to do these as four separate calls,
--    each with its own copy of the invoice code, so a failure after the claim left a
--    charged vendor with no plan and only a console line (securityflags S-8). Now a
--    refused activation after money was taken opens a billing incident and tells finance.
-- 2. The invoice is a GST tax invoice when Cosora's billing details are set: supplier and
--    recipient frozen at issue, place of supply, CGST + SGST (same state) or IGST, SAC code,
--    numbered per financial year (INV/2627/000001). Test and demo checkouts get documents
--    in their own series that say so; a live payment with no billing details set gets a
--    receipt and a billing incident. The GST amount is what the order charged less its
--    taxable value: there is no second copy of the GST formula here (_shared/gst.ts).
-- 3. Issued invoices can't be edited or deleted from a browser, admins included (S-3);
--    a processed refund issues a credit note automatically.
-- 4. Webhook events are stored once (admin.payment_events), and refund and dispute events
--    are handled.
-- 5. Reconciliation: billing_reconcile_candidates() lists unpaid live/test intents for the
--    billing-reconcile function to check against Razorpay. Its schedule is a separate
--    migration, applied only with Mitra's say-so.
-- 6. Upgrade credit (S-7): once the first live payment is fulfilled, only live invoices
--    earn credit, so demo and test-mode invoices never become real-money credit.
-- 7. A private storage bucket, invoices, for the PDFs (invoice-render).
--
-- Harness: scripts/subscriptions/p1_billing_core.sql.

-- ── 0. Guard: the rule patched here is the one that was read ────────────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'admin.subscription_quote(uuid,text,text,timestamptz)'::regprocedure))
     <> 'c61474b33a8bf1494ec854947c4b3c99' then
    raise exception 'admin.subscription_quote changed since it was read; re-read it before patching';
  end if;
end
$guard$;

-- ── 1. Columns ──────────────────────────────────────────────────────────────────────
alter table public.subscription_payment_orders
  add column if not exists payment_mode text,
  add column if not exists payment_ref text,
  add column if not exists reconciled_at timestamptz;
-- Razorpay has only ever run on test keys (production on 2026-10-08: 0 orders, 9
-- invoices, none paid through the gateway), so nothing before this migration is live.
update public.subscription_payment_orders
   set payment_mode = case when order_id like 'free\_%' then 'free' when order_id like 'demo\_%' then 'demo' else 'test' end
 where payment_mode is null;
alter table public.subscription_payment_orders alter column payment_mode set not null;
alter table public.subscription_payment_orders add constraint subscription_payment_orders_mode_check
  check (payment_mode in ('live', 'test', 'demo', 'free'));
comment on column public.subscription_payment_orders.payment_mode is
  'live or test (a Razorpay order made with live or test keys), demo (no gateway configured: no money taken), free (a discount code took the total to zero).';

alter table public.subscription_invoices
  add column if not exists payment_mode text,
  add column if not exists document_type text,
  add column if not exists supplier jsonb,
  add column if not exists recipient jsonb,
  add column if not exists place_of_supply text references public.india_states (code),
  add column if not exists supply_type text,
  add column if not exists sac_code text,
  add column if not exists cgst_paise bigint,
  add column if not exists sgst_paise bigint,
  add column if not exists igst_paise bigint,
  add column if not exists total_paise bigint;
update public.subscription_invoices
   set payment_mode = case when razorpay_payment_id is not null then 'test' else 'demo' end,
       document_type = case when razorpay_payment_id is not null then 'test' else 'demo' end
 where payment_mode is null;
alter table public.subscription_invoices alter column payment_mode set not null;
alter table public.subscription_invoices alter column document_type set not null;
alter table public.subscription_invoices add constraint subscription_invoices_mode_check
  check (payment_mode in ('live', 'test', 'demo', 'free'));
alter table public.subscription_invoices add constraint subscription_invoices_document_check
  check (document_type in ('tax_invoice', 'receipt', 'test', 'demo')
         and (supply_type is null or supply_type in ('intra', 'inter'))
         and (document_type <> 'tax_invoice' or (supplier is not null and recipient is not null and supply_type is not null)));
comment on column public.subscription_invoices.document_type is
  'tax_invoice (Cosora''s billing details set; numbered in the FY tax-invoice series), receipt (money taken, no billing details yet), test (Razorpay test mode), demo (no payment taken). Invoices from before 2026-10-08 are demo documents (or test, had any been paid through the gateway).';
comment on column public.subscription_invoices.supplier is 'Cosora''s billing details as they were when the invoice was issued.';
comment on column public.subscription_invoices.recipient is 'The vendor''s name, address, state and GSTIN as they were when the invoice was issued.';

-- ── 2. Billing settings: when live payments began ───────────────────────────────────
create table admin.billing_settings (
  id         boolean primary key default true check (id),
  live_since timestamptz
);
insert into admin.billing_settings (id) values (true);
comment on table admin.billing_settings is
  'live_since: when the first live (real-money) payment was fulfilled. From then on only live invoices earn upgrade credit (securityflags S-7).';

-- TRANSITIONAL (expand phase; remove in P13 once every payment function sets the mode).
-- The payment functions already deployed when this is applied insert orders and invoices
-- without the new columns. Until the P1 functions replace them, a missing mode is filled:
-- free_ and demo_ orders by their prefix, anything paid through the gateway as test
-- (Razorpay has only ever run on test keys). Once a live payment has been fulfilled a
-- missing mode is never guessed: the insert is refused.
create or replace function admin.subscription_order_mode_default()
returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if new.payment_mode is null then
    if exists (select 1 from admin.billing_settings s where s.live_since is not null) then
      raise exception 'payment_mode is required: live payments have begun, so it is never guessed' using errcode = '23502';
    end if;
    new.payment_mode := case when new.order_id like 'free\_%' then 'free' when new.order_id like 'demo\_%' then 'demo' else 'test' end;
  end if;
  return new;
end
$function$;
create or replace function admin.subscription_invoice_mode_default()
returns trigger
language plpgsql security definer set search_path = '' as $function$
begin
  if new.payment_mode is null or new.document_type is null then
    if exists (select 1 from admin.billing_settings s where s.live_since is not null) then
      raise exception 'payment_mode and document_type are required: live payments have begun, so they are never guessed' using errcode = '23502';
    end if;
    new.payment_mode := coalesce(new.payment_mode,
      case when new.razorpay_payment_id is not null then 'test' when new.razorpay_order_id like 'free\_%' then 'free' else 'demo' end);
    new.document_type := coalesce(new.document_type,
      case new.payment_mode when 'test' then 'test' when 'demo' then 'demo' else 'receipt' end);
  end if;
  return new;
end
$function$;
revoke all on function admin.subscription_order_mode_default() from public, anon, authenticated;
revoke all on function admin.subscription_invoice_mode_default() from public, anon, authenticated;
create trigger trg_subscription_payment_orders_mode before insert on public.subscription_payment_orders
  for each row execute function admin.subscription_order_mode_default();
create trigger trg_subscription_invoices_mode before insert on public.subscription_invoices
  for each row execute function admin.subscription_invoice_mode_default();

-- ── 3. Document numbers: one series per document kind and Indian financial year ─────
create table admin.document_series (
  series  text not null,
  fy      text not null check (fy ~ '^[0-9]{4}$'),
  last_no integer not null default 0,
  primary key (series, fy)
);
comment on table admin.document_series is
  'Consecutive numbers per document series and financial year (April to March, IST). The tax-invoice series has no gaps: test and demo documents use their own series.';

-- "2627" for 1 Apr 2026 to 31 Mar 2027, in IST.
create or replace function admin.financial_year(p_at timestamptz)
returns text
language sql immutable set search_path = '' as $function$
  select case when extract(month from (p_at at time zone 'Asia/Kolkata')) >= 4
              then lpad((extract(year from (p_at at time zone 'Asia/Kolkata'))::int % 100)::text, 2, '0')
                   || lpad(((extract(year from (p_at at time zone 'Asia/Kolkata'))::int + 1) % 100)::text, 2, '0')
              else lpad(((extract(year from (p_at at time zone 'Asia/Kolkata'))::int - 1) % 100)::text, 2, '0')
                   || lpad((extract(year from (p_at at time zone 'Asia/Kolkata'))::int % 100)::text, 2, '0')
         end
$function$;

create or replace function admin.next_document_number(p_series text, p_prefix text, p_at timestamptz)
returns text
language plpgsql volatile set search_path = '' as $function$
declare
  v_fy text := admin.financial_year(p_at);
  v_no integer;
begin
  insert into admin.document_series as s (series, fy, last_no) values (p_series, v_fy, 1)
  on conflict (series, fy) do update set last_no = s.last_no + 1
  returning s.last_no into v_no;
  return p_prefix || '/' || v_fy || '/' || lpad(v_no::text, 6, '0');
end
$function$;
revoke all on function admin.financial_year(timestamptz) from public, anon, authenticated;
revoke all on function admin.next_document_number(text, text, timestamptz) from public, anon, authenticated;

-- ── 4. Billing incidents ────────────────────────────────────────────────────────────
create table admin.billing_incidents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('activation_failed', 'invoice_incomplete', 'dispute', 'reconcile_mismatch')),
  vendor_id     uuid references public.vendor_profiles (id) on delete set null,
  order_ref     text,
  payment_ref   text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users (id) on delete set null,
  resolution    text check (resolution is null or char_length(resolution) between 1 and 1000),
  check ((resolved_at is null) = (resolution is null))
);
create index billing_incidents_open_idx on admin.billing_incidents (created_at) where resolved_at is null;
create index billing_incidents_vendor_idx on admin.billing_incidents (vendor_id);
create index billing_incidents_resolved_by_idx on admin.billing_incidents (resolved_by);
create trigger trg_admin_audit after insert or update or delete on admin.billing_incidents
  for each row execute function admin.audit_row_change();
comment on table admin.billing_incidents is
  'Money-side events a person must look at: a paid order whose plan could not be activated, a live receipt issued without Cosora''s billing details, a payment dispute. Opened by the payment functions; resolved in Cosora-Admin by super_admin or finance_admin.';

-- Open one and tell the people who act on it (active super admins and finance admins).
create or replace function admin.billing_incident_open(
  p_kind text, p_vendor uuid, p_order_ref text, p_payment_ref text, p_detail jsonb)
returns uuid
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_id uuid;
  r record;
begin
  insert into admin.billing_incidents (kind, vendor_id, order_ref, payment_ref, detail)
  values (p_kind, p_vendor, p_order_ref, p_payment_ref, coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;
  for r in select u.id from admin.admin_users u
            where u.is_active and u.admin_role in ('super_admin', 'finance_admin') loop
    perform public.notify(r.id, 'billing_incident',
      case p_kind
        when 'activation_failed' then 'A payment needs attention'
        when 'invoice_incomplete' then 'A receipt was issued without Cosora''s billing details'
        when 'dispute' then 'A payment is disputed'
        else 'A payment needs reconciling' end,
      'Open Subscriptions in Cosora-Admin to see it.', null);
  end loop;
  return v_id;
end
$function$;
revoke all on function admin.billing_incident_open(text, uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.admin_billing_incidents(p_open_only boolean default true)
returns table (id uuid, kind text, vendor_id uuid, vendor_name text, order_ref text, payment_ref text, detail jsonb,
               created_at timestamptz, resolved_at timestamptz, resolved_by_name text, resolution text)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin', 'support'), false) then
    raise exception 'not authorized: billing incidents are for finance' using errcode = '42501';
  end if;
  return query
    select i.id, i.kind, i.vendor_id, vp.brand_name, i.order_ref, i.payment_ref, i.detail, i.created_at,
           i.resolved_at, admin.audit_actor_name(i.resolved_by), i.resolution
      from admin.billing_incidents i
      left join public.vendor_profiles vp on vp.id = i.vendor_id
     where not coalesce(p_open_only, true) or i.resolved_at is null
     order by i.created_at desc
     limit 200;
end
$function$;
revoke all on function public.admin_billing_incidents(boolean) from public, anon;
grant execute on function public.admin_billing_incidents(boolean) to authenticated;

create or replace function public.admin_billing_incident_resolve(p_id uuid, p_resolution text)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin'), false) then
    raise exception 'not authorized: resolving a billing incident requires super_admin or finance_admin' using errcode = '42501';
  end if;
  if p_resolution is null or btrim(p_resolution) = '' then
    raise exception 'say what was done' using errcode = '22023';
  end if;
  perform set_config('cosora.audit_reason', left(btrim(p_resolution), 500), true);
  update admin.billing_incidents
     set resolved_at = now(), resolved_by = auth.uid(), resolution = left(btrim(p_resolution), 1000)
   where id = p_id and resolved_at is null;
  if not found then
    raise exception 'no open incident %', p_id using errcode = 'P0002';
  end if;
  perform set_config('cosora.audit_reason', '', true);
end
$function$;
revoke all on function public.admin_billing_incident_resolve(uuid, text) from public, anon;
grant execute on function public.admin_billing_incident_resolve(uuid, text) to authenticated;

-- ── 5. Credit notes ─────────────────────────────────────────────────────────────────
create table public.subscription_credit_notes (
  id                 uuid primary key default gen_random_uuid(),
  invoice_id         uuid not null references public.subscription_invoices (id) on delete restrict,
  vendor_id          uuid not null references public.vendor_profiles (id) on delete cascade,
  credit_note_number text not null unique,
  taxable_paise      bigint not null check (taxable_paise >= 0),
  cgst_paise         bigint not null default 0 check (cgst_paise >= 0),
  sgst_paise         bigint not null default 0 check (sgst_paise >= 0),
  igst_paise         bigint not null default 0 check (igst_paise >= 0),
  total_paise        bigint not null check (total_paise > 0),
  razorpay_refund_id text,
  reason             text not null,
  created_at         timestamptz not null default now(),
  check (total_paise = taxable_paise + cgst_paise + sgst_paise + igst_paise)
);
create index subscription_credit_notes_invoice_idx on public.subscription_credit_notes (invoice_id);
create index subscription_credit_notes_vendor_idx on public.subscription_credit_notes (vendor_id, created_at desc);
alter table public.subscription_credit_notes enable row level security;
revoke all on public.subscription_credit_notes from public, anon, authenticated;
grant select on public.subscription_credit_notes to authenticated;
create policy subscription_credit_notes_select on public.subscription_credit_notes
  for select to authenticated
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));
comment on table public.subscription_credit_notes is
  'A credit note for each processed refund of a subscription invoice, issued by trg_subscription_invoices_credit_note. Never edited: a new refund is a new note.';

create or replace function admin.subscription_invoice_credit_note()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  v_total   bigint := coalesce(new.total_paise, (new.amount::bigint + coalesce(new.gst_amount, 0)) * 100);
  v_refund  bigint;
  v_taxable bigint;
  v_tax     bigint;
  v_cgst    bigint := 0;
  v_sgst    bigint := 0;
  v_igst    bigint := 0;
begin
  if new.refund_status is distinct from 'processed' or old.refund_status is not distinct from 'processed' then
    return new;
  end if;
  v_refund := least(coalesce(new.refunded_amount::bigint, v_total), v_total);
  if v_refund <= 0 or v_total <= 0 then
    return new;
  end if;
  -- The refund reverses taxable value and tax in the invoice's own proportion.
  v_taxable := round(new.amount::numeric * 100 * v_refund / v_total);
  v_tax := v_refund - v_taxable;
  if new.supply_type = 'inter' then
    v_igst := v_tax;
  else
    v_cgst := v_tax / 2;
    v_sgst := v_tax - v_cgst;
  end if;
  insert into public.subscription_credit_notes
    (invoice_id, vendor_id, credit_note_number, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise,
     razorpay_refund_id, reason)
  values (new.id, new.vendor_id,
          admin.next_document_number('credit_' || new.document_type,
            case new.document_type when 'tax_invoice' then 'CN' when 'receipt' then 'RCN' when 'test' then 'TCN' else 'DCN' end,
            now()),
          v_taxable, v_cgst, v_sgst, v_igst, v_refund, new.razorpay_refund_id,
          'Refund of ' || coalesce(new.invoice_number, new.id::text));
  return new;
end
$function$;
revoke all on function admin.subscription_invoice_credit_note() from public, anon, authenticated;
create trigger trg_subscription_invoices_credit_note
  after update of refund_status on public.subscription_invoices
  for each row execute function admin.subscription_invoice_credit_note();

-- ── 6. Issued invoices are not edited from a browser (S-3) ──────────────────────────
-- The refund path (admin-refund-payment, the webhook) and the plan rule (superseded_at)
-- run as the service role or as definer functions; any browser role is refused,
-- admins included. A correction is a credit note, never an edit.
create or replace function admin.subscription_invoice_immutable()
returns trigger
language plpgsql set search_path = '' as $function$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'an issued invoice can''t be changed or deleted; a refund issues a credit note'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;
create trigger trg_subscription_invoices_immutable
  before update or delete on public.subscription_invoices
  for each row execute function admin.subscription_invoice_immutable();

-- ── 7. Webhook events, once each ────────────────────────────────────────────────────
create table admin.payment_events (
  event_id       text primary key,
  event          text not null,
  source         text not null check (source in ('subscription-webhook', 'billing-reconcile')),
  received_at    timestamptz not null default now(),
  order_ref      text,
  payment_ref    text,
  refund_ref     text,
  payload_sha256 text,
  outcome        text,
  detail         jsonb,
  processed_at   timestamptz
);
create index payment_events_order_idx on admin.payment_events (order_ref);
create index payment_events_received_idx on admin.payment_events (received_at desc);
comment on table admin.payment_events is
  'Every Razorpay webhook event the subscription webhook accepted (signature checked), keyed by Razorpay''s event id, so a redelivery is recognised and done once. Also the reconciler''s findings.';

create or replace function public.payment_event_record(
  p_event_id text, p_event text, p_source text, p_order_ref text, p_payment_ref text, p_refund_ref text, p_payload_sha256 text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'payment_event_record is for the payment functions only' using errcode = '42501';
  end if;
  insert into admin.payment_events (event_id, event, source, order_ref, payment_ref, refund_ref, payload_sha256)
  values (p_event_id, p_event, p_source, p_order_ref, p_payment_ref, p_refund_ref, p_payload_sha256)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('duplicate', true,
      'outcome', (select e.outcome from admin.payment_events e where e.event_id = p_event_id));
  end if;
  return jsonb_build_object('duplicate', false);
end
$function$;

create or replace function public.payment_event_finish(p_event_id text, p_outcome text, p_detail jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'payment_event_finish is for the payment functions only' using errcode = '42501';
  end if;
  update admin.payment_events set outcome = left(p_outcome, 100), detail = p_detail, processed_at = now()
   where event_id = p_event_id;
end
$function$;

-- A refund event from Razorpay: complete or fail the refund recorded on the invoice.
create or replace function public.subscription_refund_event(
  p_payment_ref text, p_refund_ref text, p_status text, p_amount_paise bigint)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_id uuid;
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
  return jsonb_build_object('matched', v_id is not null, 'invoice_id', v_id);
end
$function$;

create or replace function public.billing_dispute_event(p_payment_ref text, p_event text, p_detail jsonb)
returns uuid
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_vendor uuid;
  v_order text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'billing_dispute_event is for the payment functions only' using errcode = '42501';
  end if;
  select i.vendor_id, i.razorpay_order_id into v_vendor, v_order
    from public.subscription_invoices i where i.razorpay_payment_id = p_payment_ref limit 1;
  return admin.billing_incident_open('dispute', v_vendor, v_order, p_payment_ref,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('event', p_event));
end
$function$;

-- ── 8. Upgrade credit counts only real money once live payments have begun (S-7) ────
create or replace function admin.subscription_quote(p_vendor uuid, p_plan text, p_cycle text, p_at timestamptz default now())
returns jsonb
language plpgsql stable set search_path = '' as $function$
declare
  v_plan     public.subscription_plans;
  v_cur      public.vendor_subscriptions;
  v_cur_plan public.subscription_plans;
  v_list     integer;
  v_step     interval;
  v_active   boolean := false;
  v_kind     text;
  v_start    timestamptz;
  v_end      timestamptz;
  v_credit   numeric := 0;
  v_live     boolean := (select s.live_since is not null from admin.billing_settings s);
begin
  if p_cycle is null or p_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('ok', false, 'reason', 'bad_cycle');
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_plan'); end if;
  if v_plan.id = 'free' then return jsonb_build_object('ok', false, 'reason', 'bad_plan'); end if;
  if v_plan.is_invite_only then return jsonb_build_object('ok', false, 'reason', 'invite_only'); end if;
  v_list := case p_cycle when 'yearly' then v_plan.yearly_price else v_plan.monthly_price end;
  if coalesce(v_list, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'zero_amount'); end if;
  v_step := case p_cycle when 'yearly' then interval '1 year' else interval '1 month' end;

  select * into v_cur from public.vendor_subscriptions where vendor_id = p_vendor;
  v_active := found and v_cur.status = 'active' and v_cur.plan_id <> 'free'
              and v_cur.current_period_end is not null and v_cur.current_period_end > p_at;

  if not v_active then
    v_kind := 'new';
    v_start := p_at;
    v_end := p_at + v_step;
  else
    select * into v_cur_plan from public.subscription_plans where id = v_cur.plan_id;
    if p_plan = v_cur.plan_id and p_cycle = v_cur.billing_cycle then
      v_kind := 'renewal';
    elsif (v_plan.sort_order > v_cur_plan.sort_order and not (v_cur.billing_cycle = 'yearly' and p_cycle = 'monthly'))
       or (p_plan = v_cur.plan_id and v_cur.billing_cycle = 'monthly' and p_cycle = 'yearly') then
      v_kind := 'upgrade';
    else
      v_kind := 'downgrade';
    end if;

    if v_kind in ('renewal', 'downgrade') and v_cur.scheduled_plan_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'already_scheduled', 'kind', v_kind,
        'scheduled_plan_id', v_cur.scheduled_plan_id, 'scheduled_from', v_cur.scheduled_from);
    end if;

    if v_kind = 'upgrade' then
      v_start := p_at;
      v_end := p_at + v_step;
      -- The unused share of every paid, uncredited, unrefunded invoice whose period isn't
      -- over. Once live payments have begun, only live invoices count: a demo or test-mode
      -- invoice took no real money and must not become real-money credit (S-7).
      select coalesce(sum(
               i.amount::numeric
               * extract(epoch from (i.billing_period_end - greatest(p_at, i.billing_period_start)))
               / nullif(extract(epoch from (i.billing_period_end - i.billing_period_start)), 0)), 0)
        into v_credit
        from public.subscription_invoices i
       where i.vendor_id = p_vendor
         and i.status = 'paid'
         and i.superseded_at is null
         and i.razorpay_refund_id is null
         and coalesce(i.refund_status, '') not in ('pending', 'processed')
         and i.amount > 0
         and i.billing_period_start is not null
         and i.billing_period_end > p_at
         and (not coalesce(v_live, false) or i.payment_mode = 'live');
    else
      v_start := v_cur.current_period_end;
      v_end := v_cur.current_period_end + v_step;
    end if;
  end if;

  -- A credit never pays out: beyond the new plan's price it is not carried.
  v_credit := least(floor(v_credit), v_list);
  return jsonb_build_object(
    'ok', true, 'kind', v_kind, 'plan_id', p_plan, 'plan_name', v_plan.name, 'billing_cycle', p_cycle,
    'list_rupees', v_list, 'credit_rupees', v_credit::integer, 'charge_rupees', v_list - v_credit::integer,
    'period_start', v_start, 'period_end', v_end, 'starts_now', v_start <= p_at,
    'current_plan_id', case when v_active then v_cur.plan_id end,
    'current_billing_cycle', case when v_active then v_cur.billing_cycle end,
    'current_period_end', case when v_active then v_cur.current_period_end end);
end
$function$;
revoke all on function admin.subscription_quote(uuid, text, text, timestamptz) from public, anon, authenticated;

-- ── 9. The fulfilment transaction ───────────────────────────────────────────────────
create or replace function public.subscription_fulfil(p_order_ref text, p_payment_ref text, p_source text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  o           public.subscription_payment_orders;
  v_plan      public.subscription_plans;
  v_entity    admin.billing_entity;
  v_has_entity boolean := false;
  a           jsonb;
  c           jsonb;
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

  a := public.subscription_activate(o.vendor_id, o.plan_id, o.billing_cycle);
  if not coalesce((a ->> 'ok')::boolean, false) then
    if o.payment_mode in ('demo', 'free') then
      -- No money was taken: undo the claim and the code's confirmation together.
      raise exception 'activation refused: %', coalesce(a ->> 'reason', 'unknown') using errcode = 'P0001';
    end if;
    v_incident := admin.billing_incident_open('activation_failed', o.vendor_id, p_order_ref, p_payment_ref,
      jsonb_build_object('reason', a ->> 'reason', 'plan_id', o.plan_id, 'billing_cycle', o.billing_cycle,
                         'amount_paise', o.amount, 'source', p_source, 'payment_mode', o.payment_mode));
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

-- ── 10. Reconciliation ──────────────────────────────────────────────────────────────
create or replace function public.billing_reconcile_candidates(p_limit integer default 50)
returns table (order_id text, vendor_id uuid, payment_mode text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'billing_reconcile_candidates is for the reconciler only' using errcode = '42501';
  end if;
  return query
    select o.order_id, o.vendor_id, o.payment_mode, o.created_at
      from public.subscription_payment_orders o
     where o.status = 'created'
       and o.payment_mode in ('live', 'test')
       and o.created_at < now() - interval '15 minutes'
       and o.created_at > now() - interval '3 days'
       and (o.reconciled_at is null or o.reconciled_at < now() - interval '15 minutes')
     order by o.created_at
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end
$function$;

create or replace function public.billing_reconcile_mark(p_order_ref text)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'billing_reconcile_mark is for the reconciler only' using errcode = '42501';
  end if;
  update public.subscription_payment_orders set reconciled_at = now() where order_id = p_order_ref;
end
$function$;

-- ── 11. Grants for the service-role functions ───────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.subscription_fulfil(text,text,text)',
    'public.payment_event_record(text,text,text,text,text,text,text)',
    'public.payment_event_finish(text,text,jsonb)',
    'public.subscription_refund_event(text,text,text,bigint)',
    'public.billing_dispute_event(text,text,jsonb)',
    'public.billing_reconcile_candidates(integer)',
    'public.billing_reconcile_mark(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- ── 12. The invoices bucket (private; signed URLs from invoice-render) ──────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 2097152, array['application/pdf'])
on conflict (id) do nothing;
-- invoice-render writes <vendor>/<number>.pdf with the service role; the browser signs a
-- download link for it, which needs read access: the vendor's own folder, or the admins
-- the invoice's own read policy allows. Nobody writes from a browser.
create policy invoices_read on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or ((select public.is_admin())
                  and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[]))));

-- ── 13. Self-check ──────────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array[
    'public.subscription_fulfil(text,text,text)', 'public.payment_event_record(text,text,text,text,text,text,text)',
    'public.payment_event_finish(text,text,jsonb)', 'public.subscription_refund_event(text,text,text,bigint)',
    'public.billing_dispute_event(text,text,jsonb)', 'public.billing_reconcile_candidates(integer)',
    'public.billing_reconcile_mark(text)', 'admin.billing_incident_open(text,uuid,text,text,jsonb)',
    'admin.next_document_number(text,text,timestamptz)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must not be callable from a browser', f;
    end if;
  end loop;
  foreach f in array array['public.admin_billing_incidents(boolean)', 'public.admin_billing_incident_resolve(uuid,text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must be for signed-in callers only', f;
    end if;
  end loop;
  if admin.financial_year('2026-03-31 18:29:00+00') <> '2526' or admin.financial_year('2026-03-31 18:31:00+00') <> '2627' then
    raise exception 'financial years turn at midnight IST on 1 April';
  end if;
  if exists (select 1 from public.subscription_invoices where payment_mode is null or document_type is null) then
    raise exception 'every invoice needs its payment mode and document type';
  end if;
  if (select public from storage.buckets where id = 'invoices') then
    raise exception 'the invoices bucket must be private';
  end if;
  if has_table_privilege('authenticated', 'public.subscription_credit_notes', 'INSERT') then
    raise exception 'credit notes are issued only by the refund trigger';
  end if;
end
$check$;
