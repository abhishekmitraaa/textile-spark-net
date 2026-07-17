-- ─────────────────────────────────────────────────────────────
-- Vendor subscription system — core tables.
--
-- Plans are modelled as DATA (subscription_plans.limits jsonb), not scattered
-- booleans in code. A vendor has at most ONE vendor_subscriptions row (upserted
-- on purchase/upgrade/renewal); each paid period is a discrete Razorpay order
-- recorded in subscription_payment_orders (mirrors the existing ad_orders
-- create→verify→webhook lifecycle) and produces one subscription_invoices row.
--
-- No recurring Razorpay object / autopay: auto_renew is a reminder-only flag.
--
-- RLS mirrors the existing convention (is_admin(), owner = auth.uid()):
-- vendors READ their own subscription/usage/invoice/order rows; all state
-- changes happen through the edge functions using the service role (which
-- bypasses RLS), never directly from the client — so there are no public
-- INSERT/UPDATE policies on the vendor-owned billing tables.
-- ─────────────────────────────────────────────────────────────

-- ── Catalogue of plans ────────────────────────────────────────
-- Text primary key (slug) keeps seeds stable and maps 1:1 to the client PlanId.
create table if not exists public.subscription_plans (
  id             text primary key,                       -- free | basic | silver | gold | vip
  name           text not null,
  monthly_price  integer not null default 0,             -- ₹, GST-exclusive base
  yearly_price   integer not null default 0,             -- ₹, GST-exclusive base (≈ 10× monthly = 2 months free)
  currency       text not null default 'INR',
  is_invite_only boolean not null default false,
  sort_order     integer not null default 0,
  -- Enforceable limits (read by useVendorPlan + the edge functions):
  --   leads_per_month, product_cap (-1 = unlimited), ad_location_scope,
  --   has_verified_badge, search_boost_tier, has_dedicated_am,
  --   has_realtime_alerts, has_crm, has_auto_catalog, has_international.
  limits         jsonb  not null default '{}'::jsonb,
  -- Human display strings for the comparison table (one entry per spec row).
  display        jsonb  not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- ── A vendor's current subscription (one row per vendor) ──────
create table if not exists public.vendor_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  vendor_id              uuid not null unique references public.vendor_profiles(id) on delete cascade,
  plan_id                text not null references public.subscription_plans(id),
  billing_cycle          text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  status                 text not null default 'pending'
                           check (status in ('active','past_due','expired','canceled','pending')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  auto_renew             boolean not null default true,   -- reminder-only (no real autopay)
  -- Scaffolded ops fields (see "Explicit boundaries") — data model only, not wired to real delivery:
  account_manager_id     uuid references public.profiles(id),
  real_time_alerts_enabled boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists vendor_subscriptions_plan_idx on public.vendor_subscriptions(plan_id);
create index if not exists vendor_subscriptions_period_idx on public.vendor_subscriptions(current_period_end);

-- ── Per-period usage snapshot (schema of record for a future cron snapshot).
-- The UI reads LIVE counts via get_vendor_plan() to avoid drift; this table is
-- kept for periodic snapshots / historical reporting.
create table if not exists public.subscription_usage (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendor_profiles(id) on delete cascade,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  leads_used    integer not null default 0,
  products_used integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (vendor_id, period_start)
);

-- ── Invoices (one per paid period) ────────────────────────────
create table if not exists public.subscription_invoices (
  id                    uuid primary key default gen_random_uuid(),
  vendor_id             uuid not null references public.vendor_profiles(id) on delete cascade,
  subscription_id       uuid references public.vendor_subscriptions(id) on delete set null,
  plan_id               text references public.subscription_plans(id),
  amount                integer not null default 0,       -- ₹ base (GST-exclusive)
  currency              text not null default 'INR',
  gst_amount            integer,                          -- ₹ 18% GST
  gst_number            text,                             -- vendor-supplied GSTIN (input credit)
  tds_amount            integer,                          -- scaffold (usually null for SaaS)
  status                text not null default 'pending'
                          check (status in ('paid','pending','failed','refunded')),
  razorpay_payment_id   text,
  razorpay_order_id     text,
  invoice_number        text unique,
  billing_period_start  timestamptz,
  billing_period_end    timestamptz,
  pdf_url               text,                             -- nullable (client prints a formatted view for now)
  created_at            timestamptz not null default now()
);
create index if not exists subscription_invoices_vendor_idx on public.subscription_invoices(vendor_id, created_at desc);

-- ── Payment orders (mirror of ad_orders: created → paid, idempotent) ──
create table if not exists public.subscription_payment_orders (
  order_id       text primary key,
  vendor_id      uuid not null references public.vendor_profiles(id) on delete cascade,
  plan_id        text not null references public.subscription_plans(id),
  billing_cycle  text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  amount         integer not null,                        -- paise (base + GST), like ad_orders
  gst_number     text,
  status         text not null default 'created' check (status in ('created','paid','failed')),
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);
create index if not exists subscription_payment_orders_vendor_idx on public.subscription_payment_orders(vendor_id, created_at desc);

-- ── Denormalised plan cache on vendor_profiles ────────────────
-- Buyer-facing code reads vendor_profiles heavily (public SELECT) but must NOT
-- read other vendors' subscription rows (owner-only RLS). Caching the current
-- plan + its expiry here lets the trust seal and search-boost reads resolve a
-- vendor's tier without a cross-table join to vendor_subscriptions.
-- INVARIANT: plan_expires_at is set only for an active PAID plan; since every
-- paid tier grants the trust seal (per spec override), "plan_expires_at > now()"
-- alone means "trust seal granted" without needing a plans lookup at read time.
alter table public.vendor_profiles
  add column if not exists plan_id         text references public.subscription_plans(id),
  add column if not exists plan_expires_at timestamptz;

-- ── Enable RLS ────────────────────────────────────────────────
alter table public.subscription_plans           enable row level security;
alter table public.vendor_subscriptions         enable row level security;
alter table public.subscription_usage           enable row level security;
alter table public.subscription_invoices        enable row level security;
alter table public.subscription_payment_orders  enable row level security;

-- Plans: world-readable (needed by the pricing page + buyer badge/boost reads).
drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans
  for select using (true);
drop policy if exists subscription_plans_admin on public.subscription_plans;
create policy subscription_plans_admin on public.subscription_plans
  for all using (is_admin()) with check (is_admin());

-- Subscriptions / usage / invoices / orders: owner (or admin) may READ; no
-- public write policies → all writes go through the service role in the edge
-- functions (RLS is bypassed there).
drop policy if exists vendor_subscriptions_select on public.vendor_subscriptions;
create policy vendor_subscriptions_select on public.vendor_subscriptions
  for select using ((vendor_id = auth.uid()) or is_admin());
drop policy if exists vendor_subscriptions_admin on public.vendor_subscriptions;
create policy vendor_subscriptions_admin on public.vendor_subscriptions
  for all using (is_admin()) with check (is_admin());

drop policy if exists subscription_usage_select on public.subscription_usage;
create policy subscription_usage_select on public.subscription_usage
  for select using ((vendor_id = auth.uid()) or is_admin());

drop policy if exists subscription_invoices_select on public.subscription_invoices;
create policy subscription_invoices_select on public.subscription_invoices
  for select using ((vendor_id = auth.uid()) or is_admin());

drop policy if exists subscription_payment_orders_select on public.subscription_payment_orders;
create policy subscription_payment_orders_select on public.subscription_payment_orders
  for select using ((vendor_id = auth.uid()) or is_admin());
