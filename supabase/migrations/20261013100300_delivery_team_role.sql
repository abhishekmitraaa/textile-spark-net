-- The delivery team role (2026-10-13; ToDo "Create the `delivery_team` admin role").
-- A new admin role for the staff who print and dispatch Verified Certificates. On its own
-- because a new enum value can't be used in the transaction that adds it;
-- 20261013100400_delivery_team_access.sql uses it.
alter type public.admin_role_type add value if not exists 'delivery_team';
