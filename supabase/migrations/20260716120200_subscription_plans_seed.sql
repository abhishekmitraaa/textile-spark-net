-- ─────────────────────────────────────────────────────────────
-- Seed the five subscription tiers (source of truth = the project spec).
-- Trust seal is granted on EVERY paid tier (Basic+), per the deliberate
-- override; only Free has has_verified_badge=false. No matchmaking-AI field.
-- product_cap = -1 means unlimited. yearly_price = 10× monthly (2 months free).
-- ─────────────────────────────────────────────────────────────
insert into public.subscription_plans (id, name, monthly_price, yearly_price, currency, is_invite_only, sort_order, limits, display) values
('free', 'Free', 0, 0, 'INR', false, 0,
  jsonb_build_object(
    'leads_per_month', 10, 'product_cap', 2, 'ad_location_scope', 'none',
    'has_verified_badge', false, 'search_boost_tier', 0, 'has_dedicated_am', false,
    'has_realtime_alerts', false, 'has_crm', false, 'has_auto_catalog', false, 'has_international', false),
  jsonb_build_object(
    'leads', '10', 'products', '2', 'international', 'No', 'ad', 'None', 'trust', 'None',
    'search', 'Lowest', 'account_manager', 'None', 'lead_channel', 'Website only',
    'alerts', 'None', 'crm', 'None', 'catalog', 'Manual')),
('basic', 'Basic', 699, 6990, 'INR', false, 1,
  jsonb_build_object(
    'leads_per_month', 150, 'product_cap', 10, 'ad_location_scope', 'state_1',
    'has_verified_badge', true, 'search_boost_tier', 1, 'has_dedicated_am', false,
    'has_realtime_alerts', false, 'has_crm', false, 'has_auto_catalog', true, 'has_international', false),
  jsonb_build_object(
    'leads', '150', 'products', '10', 'international', 'No', 'ad', '1 state', 'trust', 'Verified seller',
    'search', 'Priority by category', 'account_manager', 'No', 'lead_channel', 'Web + email',
    'alerts', 'No', 'crm', 'No', 'catalog', 'PDF upload')),
('silver', 'Silver', 1499, 14990, 'INR', false, 2,
  jsonb_build_object(
    'leads_per_month', 360, 'product_cap', 19, 'ad_location_scope', 'state_4',
    'has_verified_badge', true, 'search_boost_tier', 2, 'has_dedicated_am', true,
    'has_realtime_alerts', true, 'has_crm', true, 'has_auto_catalog', true, 'has_international', false),
  jsonb_build_object(
    'leads', '360', 'products', '19', 'international', 'No', 'ad', '4 states', 'trust', 'Verified seller',
    'search', 'Top 10 in category', 'account_manager', 'Dedicated', 'lead_channel', 'App + email',
    'alerts', 'App notification', 'crm', 'Web + mobile', 'catalog', 'Self-service')),
('gold', 'Gold', 2299, 22990, 'INR', false, 3,
  jsonb_build_object(
    'leads_per_month', 600, 'product_cap', 200, 'ad_location_scope', 'pan_india',
    'has_verified_badge', true, 'search_boost_tier', 3, 'has_dedicated_am', true,
    'has_realtime_alerts', true, 'has_crm', true, 'has_auto_catalog', true, 'has_international', true),
  jsonb_build_object(
    'leads', '600', 'products', '200', 'international', 'Yes', 'ad', 'Pan-India', 'trust', 'Gold verified',
    'search', 'Top 5 + location-based', 'account_manager', 'Priority support', 'lead_channel', 'Full access (SMS)',
    'alerts', 'WhatsApp + email', 'crm', 'Analytics + follow-ups', 'catalog', 'We do it for you')),
('vip', 'Cosora VIP', 22000, 220000, 'INR', true, 4,
  jsonb_build_object(
    'leads_per_month', 6000, 'product_cap', -1, 'ad_location_scope', 'global',
    'has_verified_badge', true, 'search_boost_tier', 4, 'has_dedicated_am', true,
    'has_realtime_alerts', true, 'has_crm', true, 'has_auto_catalog', true, 'has_international', true),
  jsonb_build_object(
    'leads', '6,000', 'products', 'Unlimited', 'international', 'First priority', 'ad', 'Custom global',
    'trust', '100% trusted seal', 'search', 'Top 1 in segment + spotlight', 'account_manager', 'VIP account manager',
    'lead_channel', 'Full access + priority', 'alerts', 'Sales concierge', 'crm', 'Dedicated success team',
    'catalog', 'AI smart catalog'))
on conflict (id) do update set
  name = excluded.name, monthly_price = excluded.monthly_price, yearly_price = excluded.yearly_price,
  currency = excluded.currency, is_invite_only = excluded.is_invite_only, sort_order = excluded.sort_order,
  limits = excluded.limits, display = excluded.display;

-- Give the demo vendor an active Gold subscription so the whole flow (dashboard
-- badge, usage bars, generous caps, trust seal) is testable end-to-end without
-- live Razorpay keys. Id resolved by email — no hardcoded UUID.
insert into public.vendor_subscriptions
  (vendor_id, plan_id, billing_cycle, status, current_period_start, current_period_end, auto_renew)
select p.id, 'gold', 'monthly', 'active', now(), now() + interval '1 month', true
from public.profiles p
where p.email = 'demo-vendor@cosora.dev'
on conflict (vendor_id) do update set
  plan_id = excluded.plan_id, status = excluded.status,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end, updated_at = now();

update public.vendor_profiles vp
set plan_id = 'gold', plan_expires_at = now() + interval '1 month'
from public.profiles p
where p.email = 'demo-vendor@cosora.dev' and vp.id = p.id;
