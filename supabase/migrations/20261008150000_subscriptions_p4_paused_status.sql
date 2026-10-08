-- Subscriptions P4, part 1 of 2: the product status "paused" (2026-10-08).
--
-- A listing over its vendor's plan limit is paused, not deleted or sent back to review: it
-- leaves every buyer surface (they all read status = 'live') and comes back, as it was, when
-- the plan allows it again. Who pauses and resumes is 20261008150100.
--
-- On its own because Postgres won't let a new enum value be used in the transaction that
-- adds it: apply this migration first, then 20261008150100.

alter type public.product_status add value if not exists 'paused';
