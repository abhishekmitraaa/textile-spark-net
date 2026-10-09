-- Subscriptions P9: the account manager role (2026-10-09).
-- A new admin role for staff who look after vendors on Silver and above. On its own because a
-- new enum value can't be used in the transaction that adds it; 20261009130100 uses it.
alter type public.admin_role_type add value if not exists 'account_manager';
