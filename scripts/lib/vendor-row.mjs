/**
 * A vendor's OWN vendor_profiles row, whole, for specs and scripts (admin completion
 * Phase 4, 2026-09-28).
 *
 * The row's PAN, owner email, phone, WhatsApp and street address are private columns,
 * so `select("*")` is refused once they lose the table-wide grant (Phase 4b). This reads
 * every other column by name and adds the eight private ones from my_vendor_private(),
 * which only ever returns the signed-in caller's own. `db` must be signed in as the
 * vendor whose row it reads.
 *
 * catalog_embedding is left out: 1,536 numbers no check reads.
 */
export const VENDOR_PUBLIC_COLUMNS =
  "id, brand_name, about, city, state, country, business_type, is_verified, followers_count, rating_avg, " +
  "reviews_count, created_at, website, logo_url, banner_url, owner_name, gstin, cin, profile_score, " +
  "onboarding_complete, plan_id, plan_expires_at, ad_verified_until, notifications, regional, category, " +
  "office_photos, year_established, employee_count, social, recommended_product_ids, annual_turnover, capacity, " +
  "has_phone, has_whatsapp";

export async function readOwnVendorRow(db, vendorId) {
  const [{ data, error }, { data: priv, error: privError }] = await Promise.all([
    db.from("vendor_profiles").select(VENDOR_PUBLIC_COLUMNS).eq("id", vendorId).maybeSingle(),
    db.rpc("my_vendor_private"),
  ]);
  if (error) throw error;
  if (privError) throw privError;
  if (!data) return null;
  return { ...data, ...(priv?.[0] ?? {}) };
}
