-- Drops what 20261010142813_retire_usage_and_mode_shims switched off (Mitra, 2026-10-10: "just clean up the unused
-- table and the temp shims"): public.subscription_usage (empty, used by nothing) and P1's two payment-mode shims with
-- their functions. Nothing calls any of them: the guard checks the table is still empty and unreferenced and that
-- the shims are already off.
--
-- The Supabase tool declined this file on 2026-10-10 (as it has declined DROP FUNCTION before), so it is run as
-- written in the SQL editor (subscription-session/RUN-IN-SQL-EDITOR-DROP-USAGE-AND-SHIMS.sql) and keeps this written
-- version. Until then the objects stay in place, switched off and closed to browsers.

-- ── 0. Guard ───────────────────────────────────────────────────────────────────────
do $guard$
begin
  if to_regclass('public.subscription_usage') is null then
    raise exception 'subscription_usage is already gone; read the database before applying this';
  end if;
  if exists (select 1 from public.subscription_usage) then
    raise exception 'subscription_usage has rows: something writes it after all; read them before dropping it';
  end if;
  if exists (select 1 from pg_proc p where p.prosrc ilike '%subscription_usage%') then
    raise exception 'a function reads or writes subscription_usage; read it before dropping the table';
  end if;
  if exists (select 1 from pg_trigger where tgname in ('trg_subscription_payment_orders_mode', 'trg_subscription_invoices_mode')
              and tgenabled <> 'D') then
    raise exception 'apply 20261010142813 first: the payment-mode shims are still on';
  end if;
end
$guard$;

drop trigger trg_subscription_payment_orders_mode on public.subscription_payment_orders;
drop trigger trg_subscription_invoices_mode on public.subscription_invoices;
drop function admin.subscription_order_mode_default();
drop function admin.subscription_invoice_mode_default();
drop table public.subscription_usage;

-- ── Self-check ─────────────────────────────────────────────────────────────────────
do $check$
begin
  if to_regclass('public.subscription_usage') is not null
     or exists (select 1 from pg_trigger where tgname in ('trg_subscription_payment_orders_mode', 'trg_subscription_invoices_mode'))
     or exists (select 1 from pg_proc where proname in ('subscription_order_mode_default', 'subscription_invoice_mode_default')) then
    raise exception 'something meant to be dropped is still there';
  end if;
end
$check$;
