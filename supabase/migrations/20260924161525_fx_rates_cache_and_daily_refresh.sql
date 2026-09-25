-- MPF-11 (Phase 20 of the My Profile brief, 2026-09-24): the FX-rate cache behind
-- display-only currency conversion.
--
-- A buyer's Regional Settings currency (buyer_profiles.regional.currency: ₹ INR,
-- $ USD, € EUR or £ GBP) was saved and never applied. The buyer app now converts
-- displayed INR prices with these rates. DISPLAY ONLY: vendors quote and are paid
-- in INR, and Cosora's plans and GST invoices stay in INR.
--
-- One row, base INR: rates = {"INR":1,"USD":…,"EUR":…,"GBP":…}, the units of each
-- currency per rupee. rates_date is the day the source published them;
-- updated_at is when Cosora last refreshed. Written only by the fx-rates-refresh
-- edge function (service role), which pg_cron calls daily, the embedding-worker /
-- account-deletion-sweep shape. Readable by everyone, signed out too: they are
-- public reference rates, and a product card shows the same price to anyone.
-- Empty until the first refresh; the app shows INR until there is a row.

create table public.fx_rates (
  base_currency text primary key default 'INR'
    constraint fx_rates_base_is_inr check (base_currency = 'INR'),
  rates jsonb not null
    constraint fx_rates_rates_is_object check (jsonb_typeof(rates) = 'object'),
  rates_date date not null,
  source text not null,
  updated_at timestamptz not null default now()
);

comment on table public.fx_rates is
  'One row: INR-based FX rates (units of each currency per rupee) for DISPLAY-ONLY price conversion in the buyer app. Refreshed daily by the fx-rates-refresh edge function (pg_cron). Nothing is priced, charged or invoiced in another currency (MPF-11).';

alter table public.fx_rates enable row level security;
create policy fx_rates_read on public.fx_rates for select to anon, authenticated using (true);
revoke all on table public.fx_rates from anon, authenticated;
grant select on table public.fx_rates to anon, authenticated;

-- ── Schedule: daily at 16:30 UTC, after the ECB's ~16:00 CET publication ──────
-- Inert (never failing) if the Vault secret is missing, as account-deletion-sweep.
select cron.unschedule('fx-rates-refresh')
 where exists (select 1 from cron.job where jobname = 'fx-rates-refresh');
select cron.schedule(
  'fx-rates-refresh',
  '30 16 * * *',
  $job$
  select net.http_post(
    url     := 'https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/fx-rates-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'service_role_key');
  $job$
);

-- ── Self-check ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'fx-rates-refresh' and schedule = '30 16 * * *' and active) then
    raise exception 'self-check: the fx-rates-refresh cron job is missing';
  end if;
  if not (has_table_privilege('anon', 'public.fx_rates', 'SELECT')
          and has_table_privilege('authenticated', 'public.fx_rates', 'SELECT')) then
    raise exception 'self-check: fx_rates must be readable by anon and authenticated';
  end if;
  if has_table_privilege('anon', 'public.fx_rates', 'INSERT')
     or has_table_privilege('anon', 'public.fx_rates', 'UPDATE')
     or has_table_privilege('authenticated', 'public.fx_rates', 'INSERT')
     or has_table_privilege('authenticated', 'public.fx_rates', 'UPDATE')
     or has_table_privilege('authenticated', 'public.fx_rates', 'DELETE') then
    raise exception 'self-check: no client role may write fx_rates';
  end if;
  begin
    insert into public.fx_rates (base_currency, rates, rates_date, source) values ('USD', '{}', current_date, 'self-check');
    raise exception 'self-check: a non-INR base was accepted';
  exception when check_violation then
    null;
  end;
end;
$$;
