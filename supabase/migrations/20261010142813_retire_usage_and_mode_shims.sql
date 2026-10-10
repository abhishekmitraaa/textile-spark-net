-- The unused table and P1's temporary payment-mode shims are retired now, ahead of the rest of P13
-- (Mitra, 2026-10-10: "just clean up the unused table and the temp shims"). These were sections 3 and 4 of
-- 20261009170000_subscriptions_p13_truth_pass.sql, taken out of it; P13's plan wording and FAQ answers still wait
-- until every switch is on for everyone.
--
-- 1. public.subscription_usage was never written or read: no function, view or app code uses it, and production
--    holds no rows. Signed-out and signed-in browsers lose every grant on it. 20261010180100 then drops it.
-- 2. P1's shims, trg_subscription_payment_orders_mode and trg_subscription_invoices_mode, guessed a missing
--    payment_mode (and an invoice's document_type) for the payment functions deployed before P1. Every writer says
--    them now: subscription_fulfil() and autopay_charge() in the database, and the subscription edge functions,
--    all deployed with the release. The local stack has run with the shims off since P13 was applied there (the
--    paid-plan journey 123/123, the end-to-end scripts, the browser suite 78/78). Off: a missing mode is an error
--    again (payment_mode is not null). 20261010180100 then drops them.
--
-- Harnesses: scripts/subscriptions/p1_billing_core.sql (case 26) and p13_truth_pass.sql (cases 6 and 8).

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if to_regclass('public.subscription_usage') is null then
    raise exception 'subscription_usage is already gone; read the database before applying this';
  end if;
  if exists (select 1 from public.subscription_usage) then
    raise exception 'subscription_usage has rows: something writes it after all; read them before retiring it';
  end if;
  if exists (select 1 from pg_proc p where p.prosrc ilike '%subscription_usage%') then
    raise exception 'a function reads or writes subscription_usage; read it before retiring the table';
  end if;
  if (select count(*) from pg_trigger
       where tgname in ('trg_subscription_payment_orders_mode', 'trg_subscription_invoices_mode')) <> 2 then
    raise exception 'the payment-mode shims are not where they were read';
  end if;
end
$guard$;

-- ── 1. subscription_usage: no browser access ───────────────────────────────────────
revoke all on public.subscription_usage from anon, authenticated;
comment on table public.subscription_usage is
  'RETIRED 2026-10-10: never written or read; limits come from subscription_plans.limits through vendor_entitlements(). Dropped by 20261010180100.';

-- ── 2. The payment-mode shims off ──────────────────────────────────────────────────
alter table public.subscription_payment_orders disable trigger trg_subscription_payment_orders_mode;
alter table public.subscription_invoices disable trigger trg_subscription_invoices_mode;

-- ── 3. Self-check ──────────────────────────────────────────────────────────────────
do $check$
begin
  if exists (select 1 from pg_trigger where tgname in ('trg_subscription_payment_orders_mode', 'trg_subscription_invoices_mode')
              and tgenabled <> 'D') then
    raise exception 'the payment-mode shims must be off';
  end if;
  if has_table_privilege('authenticated', 'public.subscription_usage', 'select')
     or has_table_privilege('authenticated', 'public.subscription_usage', 'insert')
     or has_table_privilege('anon', 'public.subscription_usage', 'select')
     or has_table_privilege('anon', 'public.subscription_usage', 'insert') then
    raise exception 'subscription_usage is still open to browsers';
  end if;
end
$check$;
