-- ─────────────────────────────────────────────────────────────
-- Vendor Settings — persist notification + regional preferences.
--
-- Mirrors the buyer-side shape (buyer_profiles already has social /
-- notifications / regional jsonb columns, read/written via useSettings /
-- saveSetting in src/lib/queries/profile.ts). Here we add the two vendors
-- actually have a consumer for:
--   notifications jsonb  – per-event email/push toggles (VendorNotificationSettings)
--   regional      jsonb  – { language: "en" | "hi" | "gu" } (ties useLang() to the account)
--
-- No `social` column: nothing in the vendor product varies by it today, so we
-- don't add a column without a consumer.
--
-- Honest limitation (not fixed here): these toggles persist a real preference
-- but nothing in the app yet *sends* an email/push based on them — there is no
-- delivery pipeline. The UI copy reflects that (no "you'll be notified by email"
-- promises).
--
-- No RLS changes needed: vendors already upsert their own vendor_profiles row
-- (self-row policy), which covers these new columns. Both nullable — missing =
-- fall back to defaults in the data layer, never a required value.
-- ─────────────────────────────────────────────────────────────

alter table public.vendor_profiles
  add column if not exists notifications jsonb,
  add column if not exists regional      jsonb;
