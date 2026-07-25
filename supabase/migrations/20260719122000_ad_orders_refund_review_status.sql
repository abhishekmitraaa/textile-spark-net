-- Allow ad_orders to record a 'refund_review' state: an order that was paid but
-- must NOT be fulfilled — specifically a vendor whose effective plan can't run
-- ads at all (Free / ad_location_scope = 'none') whose payment reached the
-- ad-publish path. razorpay-verify-payment / razorpay-webhook now flag such
-- orders with this status instead of publishing, so a real payment surfaces for
-- manual refund / admin review rather than silently vanishing. Kept distinct
-- from 'failed' (gateway/publish failure where no fulfilment is owed) because a
-- paid-but-must-refund order is a different money state.
--
-- Extends the existing created / paid / failed lifecycle; no existing rows use
-- the new value, so this is additive and non-destructive.
alter table public.ad_orders drop constraint if exists ad_orders_status_check;
alter table public.ad_orders
  add constraint ad_orders_status_check
  check (status = any (array['created', 'paid', 'failed', 'refund_review']));
