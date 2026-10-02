-- Plans do what the Subscription FAQ says (Andy, 2026-10-01: "the app should do what
-- the FAQ says"):
--   "you can upgrade your plan at any time and the difference will be prorated.
--    Downgrades will take effect from your next billing cycle."
--   "We offer a 7-day money-back guarantee for first-time subscribers. If you're not
--    satisfied, contact us for a full refund."
--
-- ── Plan changes ─────────────────────────────────────────────────────────────
-- One rule, in one place (admin.subscription_quote), read by the browser before it
-- pays (subscription_change_preview) and by the payment functions when they price
-- and activate (subscription_quote_for, subscription_activate):
--   new        no paid plan running: starts now, full price.
--   renewal    the same plan and cycle: one more period from the current end.
--   upgrade    a higher plan (not yearly → monthly), or monthly → yearly on the same
--              plan: starts now, at the plan's price less a credit for the unused
--              part of what's already paid (each paid invoice's taxable value × the
--              share of its period still to come). The credited invoices are marked
--              superseded so they are never credited twice.
--   downgrade  anything else: paid now, starts when the current period ends. Held as
--              scheduled_* on the subscription; the period end moves to the end of
--              the paid lower plan, so the seller never drops to Free in between, and
--              expire_subscriptions() switches the plan on the day.
-- Prices stay whole rupees before GST; a discount code comes off the charge and GST
-- is charged on the rest, as before (supabase/functions/_shared/discounts.ts).
--
-- ── 7-day money-back guarantee ───────────────────────────────────────────────
-- A seller whose first paid plan is under 7 days old asks in the app (that is the
-- "contact us"); finance staff refund each payment through Razorpay in Cosora-Admin
-- (admin-refund-payment, unchanged) and then close the request, which ends the plan.
-- One request per seller, ever. Only money that went through Razorpay counts: a demo
-- checkout took none, so it isn't offered.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
-- The constraints below are new, so they are added directly.
alter table public.vendor_subscriptions
  add column if not exists scheduled_plan_id text references public.subscription_plans (id),
  add column if not exists scheduled_billing_cycle text,
  add column if not exists scheduled_from timestamptz;
alter table public.vendor_subscriptions add constraint vendor_subscriptions_scheduled_check
  check ((scheduled_plan_id is null) = (scheduled_billing_cycle is null)
     and (scheduled_plan_id is null) = (scheduled_from is null)
     and (scheduled_billing_cycle is null or scheduled_billing_cycle in ('monthly', 'yearly')));

alter table public.subscription_payment_orders
  add column if not exists change_kind text,
  add column if not exists credit_rupees integer not null default 0;
alter table public.subscription_payment_orders add constraint subscription_payment_orders_change_check
  check ((change_kind is null or change_kind in ('new', 'renewal', 'upgrade', 'downgrade')) and credit_rupees >= 0);

alter table public.subscription_invoices
  add column if not exists change_kind text,
  add column if not exists credit_rupees integer,
  add column if not exists superseded_at timestamptz;
alter table public.subscription_invoices add constraint subscription_invoices_change_check
  check ((change_kind is null or change_kind in ('new', 'renewal', 'upgrade', 'downgrade'))
     and (credit_rupees is null or credit_rupees > 0));

comment on column public.vendor_subscriptions.scheduled_plan_id is
  'A paid downgrade (or yearly → monthly) that starts at scheduled_from; current_period_end already covers it.';
comment on column public.subscription_invoices.superseded_at is
  'When an upgrade credited this invoice''s unused part; a superseded invoice is never credited again.';

-- ── 2. The rule ──────────────────────────────────────────────────────────────
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
      -- The unused share of every paid, uncredited, unrefunded invoice whose period
      -- isn't over: the current plan, any renewal paid ahead, and a downgrade paid
      -- ahead (which the upgrade replaces).
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
         and i.billing_period_end > p_at;
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

-- What the checkout shows before paying: the caller's own quote.
create function public.subscription_change_preview(p_plan text, p_cycle text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null then
    raise exception 'sign in to see a plan''s price' using errcode = '42501';
  end if;
  return admin.subscription_quote(auth.uid(), p_plan, p_cycle, now());
end
$function$;

-- What the payment functions price an order with (service role).
create function public.subscription_quote_for(p_vendor uuid, p_plan text, p_cycle text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_quote_for is for the payment functions only' using errcode = '42501';
  end if;
  return admin.subscription_quote(p_vendor, p_plan, p_cycle, now());
end
$function$;

-- A paid order becomes the plan: the rule again at the moment of activation, then
-- the subscription row and the plan cached on vendor_profiles. The invoice is still
-- written by the payment function, with the period this returns.
create function public.subscription_activate(p_vendor uuid, p_plan text, p_cycle text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  q       jsonb;
  v_kind  text;
  v_start timestamptz;
  v_end   timestamptz;
  v_sub   uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'subscription_activate is for the payment functions only' using errcode = '42501';
  end if;
  -- One activation per seller at a time (verify-payment and the webhook can race).
  perform pg_advisory_xact_lock(hashtextextended('cosora.subscription:' || p_vendor::text, 0));

  q := admin.subscription_quote(p_vendor, p_plan, p_cycle, now());
  if not coalesce((q ->> 'ok')::boolean, false) then
    return q;
  end if;
  v_kind := q ->> 'kind';
  v_start := (q ->> 'period_start')::timestamptz;
  v_end := (q ->> 'period_end')::timestamptz;

  if v_kind in ('new', 'upgrade') then
    if v_kind = 'upgrade' then
      update public.subscription_invoices
         set superseded_at = now()
       where vendor_id = p_vendor and status = 'paid' and superseded_at is null
         and billing_period_end is not null and billing_period_end > now();
    end if;
    insert into public.vendor_subscriptions as s
      (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew, updated_at)
    values (p_vendor, p_plan, p_cycle, 'active', v_start, v_end, true, now())
    on conflict (vendor_id) do update
       set plan_id = excluded.plan_id, billing_cycle = excluded.billing_cycle, status = 'active',
           current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
           auto_renew = true, updated_at = now(),
           scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null
    returning s.id into v_sub;
    update public.vendor_profiles set plan_id = p_plan, plan_expires_at = v_end where id = p_vendor;
  elsif v_kind = 'renewal' then
    update public.vendor_subscriptions
       set current_period_end = v_end, updated_at = now()
     where vendor_id = p_vendor
    returning id into v_sub;
    update public.vendor_profiles set plan_expires_at = v_end where id = p_vendor;
  else
    update public.vendor_subscriptions
       set scheduled_plan_id = p_plan, scheduled_billing_cycle = p_cycle, scheduled_from = v_start,
           current_period_end = v_end, updated_at = now()
     where vendor_id = p_vendor
    returning id into v_sub;
    update public.vendor_profiles set plan_expires_at = v_end where id = p_vendor;
  end if;

  return q || jsonb_build_object('subscription_id', v_sub);
end
$function$;

revoke all on function public.subscription_change_preview(text, text) from public, anon;
grant execute on function public.subscription_change_preview(text, text) to authenticated;
revoke all on function public.subscription_quote_for(uuid, text, text) from public, anon, authenticated;
revoke all on function public.subscription_activate(uuid, text, text) from public, anon, authenticated;
grant execute on function public.subscription_quote_for(uuid, text, text) to service_role;
grant execute on function public.subscription_activate(uuid, text, text) to service_role;

-- ── 3. The daily sweep switches a scheduled plan on its day ──────────────────
do $guard$
begin
  if md5((select prosrc from pg_proc where oid = 'public.expire_subscriptions()'::regprocedure))
     <> '6bfdcceebd37fbbb24a8f58bb7624ec3' then
    raise exception 'expire_subscriptions changed since it was read; re-read it before patching';
  end if;
  if md5((select prosrc from pg_proc where oid = 'public.get_vendor_plan(uuid)'::regprocedure))
     <> '34d0d7e2734c5e922dcdb54db4afac0b' then
    raise exception 'get_vendor_plan changed since it was read; re-read it before patching';
  end if;
end
$guard$;

create or replace function public.expire_subscriptions()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n integer;
  r record;
begin
  -- Paid downgrades whose day has come (Subscription FAQ: "from your next billing
  -- cycle"). The period end already covers them, so this only renames the plan.
  for r in
    update public.vendor_subscriptions s
       set plan_id = s.scheduled_plan_id, billing_cycle = s.scheduled_billing_cycle,
           current_period_start = s.scheduled_from,
           scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_from = null,
           updated_at = now()
     where s.status = 'active' and s.scheduled_from is not null and s.scheduled_from <= now()
    returning s.vendor_id, s.plan_id, s.current_period_end
  loop
    update public.vendor_profiles set plan_id = r.plan_id, plan_expires_at = r.current_period_end where id = r.vendor_id;
    perform public.notify(r.vendor_id, 'subscription_changed', 'Your plan has changed',
      'The plan you paid for is now active.', null);
  end loop;

  update public.vendor_subscriptions
     set status = 'expired', updated_at = now()
   where status = 'active'
     and current_period_end is not null
     and current_period_end < now();
  get diagnostics n = row_count;

  update public.vendor_profiles
     set plan_id = null, plan_expires_at = null
   where plan_expires_at is not null
     and plan_expires_at < now();

  return n;
end;
$function$;

-- get_vendor_plan(): as read on 2026-10-02, plus the scheduled change (the four
-- scheduled_* keys at the end).
create or replace function public.get_vendor_plan(v uuid default auth.uid())
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  vid            uuid := coalesce(v, auth.uid());
  sub            public.vendor_subscriptions%rowtype;
  eff_plan_id    text := 'free';
  eff_status     text := 'free';
  plan           public.subscription_plans%rowtype;
  next_plan_name text;
  p_start        timestamptz;
  p_end          timestamptz;
  products_used  integer := 0;
  leads_used     integer := 0;
  verified_admin boolean := false;
  paid_active    boolean := false;
begin
  if vid is null then
    return null;
  end if;
  if not (vid = auth.uid() or public.is_admin()) then
    return null;
  end if;

  select * into sub from public.vendor_subscriptions where vendor_id = vid;
  if found and sub.status = 'active' and sub.current_period_end is not null
     and sub.current_period_end > now() then
    eff_plan_id := sub.plan_id;
    eff_status  := sub.status;
    paid_active := (sub.plan_id <> 'free');
  end if;

  select * into plan from public.subscription_plans where id = eff_plan_id;
  if not found then
    select * into plan from public.subscription_plans where id = 'free';
  end if;
  if paid_active and sub.scheduled_plan_id is not null then
    select name into next_plan_name from public.subscription_plans where id = sub.scheduled_plan_id;
  end if;

  if paid_active then
    p_start := sub.current_period_start;
    p_end   := sub.current_period_end;
  else
    p_start := date_trunc('month', now());
    p_end   := p_start + interval '1 month';
  end if;

  select count(*) into products_used
    from public.products
   where vendor_id = vid and status in ('under_review','live');

  -- Open-marketplace replies only (rfqs.vendor_id is null). Targeted requests
  -- do not consume the cap.
  select count(distinct q.rfq_id) into leads_used
    from public.quotes q
    join public.rfqs r on r.id = q.rfq_id
   where q.vendor_id = vid
     and q.created_at >= p_start
     and r.vendor_id is null;

  select coalesce(is_verified, false) into verified_admin
    from public.vendor_profiles where id = vid;

  return jsonb_build_object(
    'vendor_id',            vid,
    'effective_plan_id',    eff_plan_id,
    'status',               eff_status,
    'billing_cycle',        coalesce(sub.billing_cycle, 'monthly'),
    'auto_renew',           coalesce(sub.auto_renew, true),
    'current_period_start', p_start,
    'current_period_end',   p_end,
    'subscription_end',     sub.current_period_end,
    'is_invite_only',       plan.is_invite_only,
    'is_verified_admin',    verified_admin,
    'trust_seal',           (verified_admin or (paid_active and coalesce((plan.limits->>'has_verified_badge')::boolean, false))),
    'plan', jsonb_build_object(
              'id',            plan.id,
              'name',          plan.name,
              'monthly_price', plan.monthly_price,
              'yearly_price',  plan.yearly_price,
              'currency',      plan.currency,
              'is_invite_only',plan.is_invite_only,
              'sort_order',    plan.sort_order,
              'limits',        plan.limits,
              'display',       plan.display
            ),
    'limits', plan.limits,
    'usage', jsonb_build_object(
               'products_used', products_used,
               'leads_used',    leads_used,
               'period_start',  p_start,
               'period_end',    p_end
             ),
    'scheduled_plan_id',       case when paid_active then sub.scheduled_plan_id end,
    'scheduled_plan_name',     next_plan_name,
    'scheduled_billing_cycle', case when paid_active then sub.scheduled_billing_cycle end,
    'scheduled_from',          case when paid_active then sub.scheduled_from end
  );
end;
$function$;

-- ── 4. The 7-day money-back guarantee ────────────────────────────────────────
create table if not exists public.refund_guarantee_requests (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null unique references public.vendor_profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason       text check (reason is null or char_length(reason) <= 1000),
  invoice_ids  uuid[] not null check (cardinality(invoice_ids) > 0),
  total_rupees integer not null check (total_rupees > 0),
  status       text not null default 'open' check (status in ('open', 'closed')),
  closed_at    timestamptz,
  closed_by    uuid references auth.users (id) on delete set null,
  close_note   text check (close_note is null or char_length(close_note) <= 1000),
  check ((status = 'closed') = (closed_at is not null))
);
create index if not exists refund_guarantee_requests_open_idx
  on public.refund_guarantee_requests (requested_at) where status = 'open';
create index if not exists refund_guarantee_requests_closed_by_idx
  on public.refund_guarantee_requests (closed_by);

alter table public.refund_guarantee_requests enable row level security;
revoke all on public.refund_guarantee_requests from public, anon, authenticated;
grant select on public.refund_guarantee_requests to authenticated;
-- The seller's own request, and the roles Phase 11 gives the Subscriptions section
-- (20261002064904: super_admin, finance_admin, support). The table is new here, so the
-- policy and the audit trigger are created directly.
create policy refund_guarantee_requests_read on public.refund_guarantee_requests
  for select to authenticated
  using (vendor_id = (select auth.uid())
         or ((select public.is_admin())
             and (select public.admin_role()) = any (array['super_admin', 'finance_admin', 'support']::public.admin_role_type[])));

create trigger trg_admin_audit after insert or update or delete on public.refund_guarantee_requests
  for each row execute function admin.audit_row_change('vendor_id');

comment on table public.refund_guarantee_requests is
  'The 7-day money-back guarantee: one request per seller, written by refund_guarantee_request(), closed by admin_refund_guarantee_close() once every payment in it is refunded.';

-- Where a seller stands: a request already made, or the payments a request would cover.
create or replace function admin.refund_guarantee_eval(p_vendor uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable set search_path = '' as $function$
declare
  v_req      public.refund_guarantee_requests;
  v_first    timestamptz;
  v_deadline timestamptz;
  v_invoices jsonb;
  v_total    integer;
begin
  select * into v_req from public.refund_guarantee_requests where vendor_id = p_vendor;
  if found then
    return jsonb_build_object('eligible', false, 'reason', case v_req.status when 'open' then 'requested' else 'closed' end,
      'requested_at', v_req.requested_at, 'total_rupees', v_req.total_rupees, 'closed_at', v_req.closed_at);
  end if;

  -- "First-time": measured from the seller's first payment of any amount.
  select min(i.created_at) into v_first
    from public.subscription_invoices i
   where i.vendor_id = p_vendor and i.amount + coalesce(i.gst_amount, 0) > 0;
  if v_first is null then
    return jsonb_build_object('eligible', false, 'reason', 'no_payment');
  end if;
  v_deadline := v_first + interval '7 days';
  if exists (select 1 from public.subscription_invoices i
              where i.vendor_id = p_vendor
                and (i.razorpay_refund_id is not null or i.refund_status is not null or i.status = 'refunded')) then
    return jsonb_build_object('eligible', false, 'reason', 'already_refunded', 'deadline', v_deadline);
  end if;
  if p_at > v_deadline then
    return jsonb_build_object('eligible', false, 'reason', 'window_closed', 'deadline', v_deadline);
  end if;

  -- Every payment in the first 7 days that went through Razorpay, in full.
  select jsonb_agg(jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number, 'plan_id', i.plan_id,
                                      'total_rupees', i.amount + coalesce(i.gst_amount, 0), 'paid_at', i.created_at)
                   order by i.created_at),
         sum(i.amount + coalesce(i.gst_amount, 0))
    into v_invoices, v_total
    from public.subscription_invoices i
   where i.vendor_id = p_vendor and i.status = 'paid' and i.razorpay_payment_id is not null
     and i.amount + coalesce(i.gst_amount, 0) > 0
     and i.created_at >= v_first and i.created_at <= v_deadline;
  if v_invoices is null then
    -- Demo checkouts (no Razorpay keys): no money was taken, so there's none to return.
    return jsonb_build_object('eligible', false, 'reason', 'no_money_taken', 'deadline', v_deadline);
  end if;
  return jsonb_build_object('eligible', true, 'deadline', v_deadline, 'total_rupees', v_total, 'invoices', v_invoices);
end
$function$;
revoke all on function admin.refund_guarantee_eval(uuid, timestamptz) from public, anon, authenticated;

create function public.refund_guarantee_status()
returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return admin.refund_guarantee_eval(auth.uid(), now());
end
$function$;

create function public.refund_guarantee_request(p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  e     jsonb;
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.account_not_deleted(v_uid) then
    raise exception 'this account is deleted' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cosora.refund_guarantee:' || v_uid::text, 0));
  e := admin.refund_guarantee_eval(v_uid, now());
  if not coalesce((e ->> 'eligible')::boolean, false) then
    raise exception 'this account can''t ask for a refund under the 7-day guarantee (%)', e ->> 'reason'
      using errcode = 'P0001', hint = coalesce(e ->> 'reason', 'not_eligible');
  end if;
  select array_agg((x ->> 'id')::uuid) into v_ids from jsonb_array_elements(e -> 'invoices') x;
  insert into public.refund_guarantee_requests (vendor_id, reason, invoice_ids, total_rupees)
  values (v_uid, nullif(left(btrim(coalesce(p_reason, '')), 1000), ''), v_ids, (e ->> 'total_rupees')::integer);
  perform public.notify(v_uid, 'refund_requested', 'Refund requested',
    format('We have your request for a refund of ₹%s under the 7-day money-back guarantee. Our team refunds it to the card or account you paid with, and your plan ends then.',
           to_char((e ->> 'total_rupees')::integer, 'FM99,99,99,999')),
    null);
  return admin.refund_guarantee_eval(v_uid, now());
end
$function$;

revoke all on function public.refund_guarantee_status() from public, anon;
revoke all on function public.refund_guarantee_request(text) from public, anon;
grant execute on function public.refund_guarantee_status() to authenticated;
grant execute on function public.refund_guarantee_request(text) to authenticated;

-- Cosora-Admin: the requests, with each payment's refund state.
create function public.admin_refund_guarantee_requests(p_status text default 'open')
returns table (
  id uuid, vendor_id uuid, vendor_name text, requested_at timestamptz, reason text, total_rupees integer,
  status text, closed_at timestamptz, closed_by_name text, close_note text, invoices jsonb)
language plpgsql stable security definer set search_path = '' as $function$
#variable_conflict use_column
begin
  -- The Subscriptions section's readers (Phase 11, 20261002064904); closing is
  -- super_admin and finance_admin only (admin_refund_guarantee_close).
  if not coalesce(public.is_admin() and public.admin_role() in ('super_admin', 'finance_admin', 'support'), false) then
    raise exception 'not authorized: refund requests are for finance' using errcode = '42501';
  end if;
  return query
    select r.id, r.vendor_id, coalesce(vp.brand_name, p.full_name), r.requested_at, r.reason, r.total_rupees,
           r.status, r.closed_at, admin.audit_actor_name(r.closed_by), r.close_note,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', i.id, 'invoice_number', i.invoice_number, 'plan_id', i.plan_id,
                     'total_rupees', i.amount + coalesce(i.gst_amount, 0), 'status', i.status,
                     'razorpay_payment_id', i.razorpay_payment_id, 'razorpay_refund_id', i.razorpay_refund_id,
                     'refund_status', i.refund_status) order by i.created_at), '[]'::jsonb)
              from public.subscription_invoices i where i.id = any (r.invoice_ids))
      from public.refund_guarantee_requests r
      left join public.vendor_profiles vp on vp.id = r.vendor_id
      left join public.profiles p on p.id = r.vendor_id
     where p_status is null or r.status = p_status
     order by r.requested_at;
end
$function$;

-- After every payment in the request is refunded through Razorpay: the plan ends and
-- the request closes.
create function public.admin_refund_guarantee_close(p_request_id uuid, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $function$
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
  if exists (select 1 from public.subscription_invoices i
              where i.id = any (v_req.invoice_ids) and i.razorpay_refund_id is null) then
    raise exception 'refund every payment in the request first' using errcode = 'P0001', hint = 'refund_first';
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

revoke all on function public.admin_refund_guarantee_requests(text) from public, anon;
revoke all on function public.admin_refund_guarantee_close(uuid, text) from public, anon;
grant execute on function public.admin_refund_guarantee_requests(text) to authenticated;
grant execute on function public.admin_refund_guarantee_close(uuid, text) to authenticated;

-- ── 5. Self-check ────────────────────────────────────────────────────────────
do $check$
declare
  f text;
begin
  foreach f in array array['public.subscription_quote_for(uuid,text,text)', 'public.subscription_activate(uuid,text,text)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% must be service_role only', f;
    end if;
  end loop;
  foreach f in array array['public.subscription_change_preview(text,text)', 'public.refund_guarantee_status()',
                           'public.refund_guarantee_request(text)', 'public.admin_refund_guarantee_requests(text)',
                           'public.admin_refund_guarantee_close(uuid,text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% must be for signed-in callers only', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'admin.subscription_quote(uuid,text,text,timestamptz)', 'EXECUTE') then
    raise exception 'admin.subscription_quote must not be callable by clients';
  end if;
  if (select relrowsecurity from pg_class where oid = 'public.refund_guarantee_requests'::regclass) is not true then
    raise exception 'refund_guarantee_requests must have RLS on';
  end if;
  if has_table_privilege('authenticated', 'public.refund_guarantee_requests', 'INSERT') then
    raise exception 'refund_guarantee_requests must be written through refund_guarantee_request() only';
  end if;
end
$check$;
