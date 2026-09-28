-- Admin completion, Phase 5 (Mitra, 2026-09-28): the payments ledger, from the real tables.
--
-- Cosora-Admin's Payments page showed a dev-seed fixture: the money lives in three tables
-- with two units and three status vocabularies, and deriving a ledger in the browser would
-- have disagreed with Reports. This puts one ledger in the database:
--
--   admin.payment_entries          one row per money movement, every amount in paise
--   admin_payments_ledger(...)     filtered, keyset-paginated rows (newest first)
--   admin_payments_summary(...)    totals for the same filters, on the same definitions as
--                                  admin_report_summary(), so Payments and Reports agree
--
-- Sources and units:
--   subscription_invoices          amount and gst_amount in RUPEES (×100 here)
--     └─ refund columns            refunded_amount in PAISE (Razorpay's figure)
--   subscription_payment_orders    amount in PAISE, GST included: unfinished checkouts
--                                  (a paid one is already its invoice row)
--   ad_orders                      amount in PAISE, no GST line
--
-- Status vocabulary (one for every row):
--   paid        money captured
--   pending     a checkout under 24 hours old, a refund the gateway hasn't settled, or an
--               invoice stored as pending
--   abandoned   a checkout left unpaid for 24 hours or more
--   failed      a payment or refund that failed
--   review      an ad order that was paid but couldn't be fulfilled (refund by hand)
--   refunded    a refund the gateway processed, or an invoice stored as refunded
--
-- Reads are for super_admin, finance_admin and support (Cosora-Admin roles.ts "payments").

-- ── 1. When a refund was asked for ──────────────────────────────────────────
-- subscription_invoices only had refunded_at, which the gateway's answer sets. A refund that
-- is pending or failed had no time of its own. admin-refund-payment claims a refund by
-- setting refund_status to 'pending'; this stamps the moment, with no function change.
alter table public.subscription_invoices add column if not exists refund_requested_at timestamptz;

create or replace function admin.stamp_refund_requested_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.refund_status = 'pending' and old.refund_status is distinct from 'pending' then
    new.refund_requested_at := now();
  end if;
  return new;
end
$function$;

drop trigger if exists trg_subscription_invoices_refund_requested on public.subscription_invoices;
create trigger trg_subscription_invoices_refund_requested
  before update of refund_status on public.subscription_invoices
  for each row execute function admin.stamp_refund_requested_at();

-- ── 2. Indexes for newest-first reads and date filters ──────────────────────
create index if not exists subscription_invoices_created_idx
  on public.subscription_invoices (created_at desc);
create index if not exists subscription_invoices_refund_time_idx
  on public.subscription_invoices ((coalesce(refunded_at, refund_requested_at, created_at)) desc)
  where refund_status is not null;
create index if not exists subscription_payment_orders_open_idx
  on public.subscription_payment_orders (created_at desc)
  where status in ('created', 'failed');
create index if not exists ad_orders_time_idx
  on public.ad_orders ((coalesce(paid_at, created_at)) desc);
create index if not exists ad_orders_vendor_idx
  on public.ad_orders (vendor_id, created_at desc);

-- ── 3. The ledger ─────────────────────────────────────────────────────────────
-- In the admin schema, which PostgREST doesn't expose: only the definer RPCs below read it.
create or replace view admin.payment_entries as
  -- A subscription invoice: the payment itself.
  select 'invoice:' || i.id::text                                  as entry_key,
         i.created_at                                               as occurred_at,
         'subscription'::text                                       as kind,
         i.status                                                   as status,
         i.vendor_id                                                as vendor_id,
         coalesce(i.invoice_number, i.id::text)                     as reference,
         coalesce(sp.name, i.plan_id) || ' plan · '
           || case when i.billing_period_end - i.billing_period_start >= interval '360 days'
                   then 'yearly' else 'monthly' end                 as detail,
         i.amount::bigint * 100                                     as net_paise,
         coalesce(i.gst_amount, 0)::bigint * 100                    as gst_paise,
         (i.amount + coalesce(i.gst_amount, 0))::bigint * 100       as total_paise,
         i.razorpay_payment_id                                      as gateway_ref,
         i.razorpay_payment_id is not null                          as verified,
         false                                                      as includes_certificate,
         'subscription_invoices'::text                              as source_table,
         i.id::text                                                 as source_id
    from public.subscription_invoices i
    left join public.subscription_plans sp on sp.id = i.plan_id
  union all
  -- A refund of that invoice, as a negative row of its own.
  select 'refund:' || i.id::text,
         coalesce(i.refunded_at, i.refund_requested_at, i.created_at),
         'refund',
         case i.refund_status when 'processed' then 'refunded' when 'failed' then 'failed' else 'pending' end,
         i.vendor_id,
         coalesce(i.invoice_number, i.id::text),
         'Refund of ' || coalesce(i.invoice_number, 'an invoice'),
         null::bigint,
         null::bigint,
         -coalesce(i.refunded_amount::bigint, (i.amount + coalesce(i.gst_amount, 0))::bigint * 100),
         i.razorpay_refund_id,
         i.razorpay_refund_id is not null,
         false,
         'subscription_invoices',
         i.id::text
    from public.subscription_invoices i
   where i.refund_status is not null
  union all
  -- A subscription checkout that didn't complete. A paid one is its invoice row above.
  select 'intent:' || o.order_id,
         o.created_at,
         'subscription',
         case when o.status = 'failed' then 'failed'
              when o.created_at > now() - interval '24 hours' then 'pending'
              else 'abandoned' end,
         o.vendor_id,
         o.order_id,
         coalesce(sp.name, o.plan_id) || ' plan · ' || o.billing_cycle || ' · checkout',
         null::bigint,
         null::bigint,
         o.amount::bigint,
         o.order_id,
         false,
         false,
         'subscription_payment_orders',
         o.order_id
    from public.subscription_payment_orders o
    left join public.subscription_plans sp on sp.id = o.plan_id
   where o.status in ('created', 'failed')
  union all
  -- An ad or certificate purchase. An order of the certificate alone is 'certificate'; one
  -- that also buys ad placements is 'ad_purchase' with includes_certificate. The amount
  -- isn't split: the order doesn't store per-line prices.
  select 'ad:' || o.order_id,
         coalesce(o.paid_at, o.created_at),
         case when coalesce(o.spec -> 'placementIds', '[]'::jsonb) = '["verifiedCertificate"]'::jsonb
              then 'certificate' else 'ad_purchase' end,
         case o.status
              when 'paid' then 'paid'
              when 'refund_review' then 'review'
              when 'failed' then 'failed'
              else case when o.created_at > now() - interval '24 hours' then 'pending' else 'abandoned' end
         end,
         o.vendor_id,
         o.order_id,
         coalesce(nullif(btrim(o.spec ->> 'campaignLabel'), ''), 'Ad campaign') || ' · '
           || coalesce((select string_agg(p.value, ', ')
                          from jsonb_array_elements_text(coalesce(o.spec -> 'placementIds', '[]'::jsonb)) as p(value)),
                       'no placements'),
         null::bigint,
         null::bigint,
         o.amount::bigint,
         o.order_id,
         o.status in ('paid', 'refund_review'),
         coalesce(o.spec -> 'placementIds', '[]'::jsonb) ? 'verifiedCertificate',
         'ad_orders',
         o.order_id
    from public.ad_orders o;

revoke all on admin.payment_entries from public, anon, authenticated;

-- ── 4. The admin RPCs ─────────────────────────────────────────────────────────
create or replace function public.admin_payments_ledger(
  p_kinds      text[]      default null,
  p_statuses   text[]      default null,
  p_from       timestamptz default null,
  p_to         timestamptz default null,
  p_vendor     uuid        default null,
  p_search     text        default null,
  p_cursor_at  timestamptz default null,
  p_cursor_key text        default null,
  p_limit      int         default 50)
returns table(entry_key text, occurred_at timestamptz, kind text, status text, vendor_id uuid,
              vendor_name text, vendor_city text, reference text, detail text, net_paise bigint,
              gst_paise bigint, total_paise bigint, gateway_ref text, verified boolean,
              includes_certificate boolean, source_table text, source_id text)
language plpgsql
stable
security definer
set search_path = ''
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
           e.verified, e.includes_certificate, e.source_table, e.source_id
      from admin.payment_entries e
      left join public.vendor_profiles v on v.id = e.vendor_id
     where (p_kinds is null or e.kind = any (p_kinds))
       and (p_statuses is null or e.status = any (p_statuses))
       and (p_from is null or e.occurred_at >= p_from)
       and (p_to is null or e.occurred_at < p_to)
       and (p_vendor is null or e.vendor_id = p_vendor)
       and (v_search is null
            or e.vendor_id = any (v_vendors)
            or e.reference ilike v_like
            or e.gateway_ref ilike v_like)
       and (p_cursor_at is null or (e.occurred_at, e.entry_key) < (p_cursor_at, p_cursor_key))
     order by e.occurred_at desc, e.entry_key desc
     limit v_limit;
end
$function$;

create or replace function public.admin_payments_summary(
  p_kinds    text[]      default null,
  p_statuses text[]      default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null,
  p_vendor   uuid        default null,
  p_search   text        default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
  -- beside them, not netted into them.
  select jsonb_build_object(
           'generated_at',            now(),
           'entries',                 count(*),
           'paid',                    count(*) filter (where e.status = 'paid'),
           'pending',                 count(*) filter (where e.status = 'pending'),
           'abandoned',               count(*) filter (where e.status = 'abandoned'),
           'failed',                  count(*) filter (where e.status = 'failed'),
           'review',                  count(*) filter (where e.status = 'review'),
           'refunds',                 count(*) filter (where e.kind = 'refund'),
           'paid_paise',              coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund'), 0),
           'subscriptions_net_paise', coalesce(sum(e.net_paise) filter (where e.status = 'paid' and e.kind = 'subscription'), 0),
           'gst_paise',               coalesce(sum(e.gst_paise) filter (where e.status = 'paid' and e.kind = 'subscription'), 0),
           'ads_paise',               coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind in ('ad_purchase', 'certificate')), 0),
           'refunded_paise',          coalesce(-sum(e.total_paise) filter (where e.kind = 'refund' and e.status = 'refunded'), 0),
           'review_paise',            coalesce(sum(e.total_paise) filter (where e.status = 'review'), 0),
           'unverified_paise',        coalesce(sum(e.total_paise) filter (where e.status = 'paid' and e.kind <> 'refund' and not e.verified), 0),
           'unverified',              count(*) filter (where e.status = 'paid' and e.kind <> 'refund' and not e.verified))
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
          or e.gateway_ref ilike v_like);
  return v_result;
end
$function$;

revoke all on function public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, int)
  from public, anon, authenticated;
revoke all on function public.admin_payments_summary(text[], text[], timestamptz, timestamptz, uuid, text)
  from public, anon, authenticated;
revoke all on function admin.stamp_refund_requested_at() from public, anon, authenticated;
grant execute on function public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, int)
  to authenticated;
grant execute on function public.admin_payments_summary(text[], text[], timestamptz, timestamptz, uuid, text)
  to authenticated;

-- ── Self-check ───────────────────────────────────────────────────────────────
do $check$
declare
  f text;
  v_ledger bigint;
  v_invoices bigint;
begin
  foreach f in array array[
    'public.admin_payments_ledger(text[], text[], timestamptz, timestamptz, uuid, text, timestamptz, text, int)',
    'public.admin_payments_summary(text[], text[], timestamptz, timestamptz, uuid, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception 'self-check: grants on % are wrong', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'self-check: % is not SECURITY DEFINER', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'admin.payment_entries', 'SELECT')
     or has_table_privilege('anon', 'admin.payment_entries', 'SELECT') then
    raise exception 'self-check: a client role can read admin.payment_entries';
  end if;
  -- Every invoice is exactly one payment row.
  select count(*) into v_ledger from admin.payment_entries e where e.source_table = 'subscription_invoices' and e.kind = 'subscription';
  select count(*) into v_invoices from public.subscription_invoices;
  if v_ledger <> v_invoices then
    raise exception 'self-check: % invoices but % invoice rows in the ledger', v_invoices, v_ledger;
  end if;
  if not exists (select 1 from pg_trigger t where t.tgname = 'trg_subscription_invoices_refund_requested' and not t.tgisinternal) then
    raise exception 'self-check: the refund-request trigger is missing';
  end if;
end
$check$;
