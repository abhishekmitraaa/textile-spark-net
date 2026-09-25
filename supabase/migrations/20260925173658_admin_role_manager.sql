-- ─────────────────────────────────────────────────────────────
-- MPF-26, part 1: the Manager admin role.
--
-- Mitra's decision (2026-09-25): a new managerial role that can read the Admin
-- Log, alongside super_admin. It is its own migration because a new enum value
-- can't be used in the transaction that adds it; the next migration
-- (admin_audit_log) names it.
--
-- Nothing else changes for existing roles. A manager is an active admin, so
-- is_admin() is true for it like for every other role; Cosora-Admin's roles.ts
-- decides which sections it sees (the Admin Log, and the all-role Reports and
-- Live Activity). admin_grant, admin_set_role and admin_role_values take the
-- enum, so a super_admin can grant it with no further change.
-- ─────────────────────────────────────────────────────────────

alter type public.admin_role_type add value if not exists 'manager';
