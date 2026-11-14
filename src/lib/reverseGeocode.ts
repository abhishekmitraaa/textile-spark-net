// "Use current location" on sign-up's Account Information: the device's position → an Indian pincode, city and state,
// through BigDataCloud's keyless reverse-geocode (buyer sign-up audit 2026-11-13, item 14c).
//
// - The position is rounded to 2 decimal places (about 1 km) before it leaves the device: a pincode needs no more, and
//   the full reading pinpoints a home. The page says so ("Your approximate location (about 1 km) is looked up by
//   BigDataCloud.").
// - A failed request is a failure, not an empty answer (`res.ok` is checked).
// - Only an answer inside India counts: a pincode is India's, and a UK postcode in the pincode field is refused by the
//   database (trg_buyer_profiles_field_checks).

export type PincodeLookup =
  | { pincode: string; city: string | null; state: string | null }
  | { error: "outside_india" | "lookup_failed" };

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function lookupPincode(lat: number, lon: number): Promise<PincodeLookup> {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(round2(lat)));
  url.searchParams.set("longitude", String(round2(lon)));
  url.searchParams.set("localityLanguage", "en");
  let data: { countryCode?: unknown; postcode?: unknown; city?: unknown; locality?: unknown; principalSubdivision?: unknown };
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return { error: "lookup_failed" };
    data = await res.json();
  } catch {
    return { error: "lookup_failed" };
  }
  if (data.countryCode !== "IN") return { error: "outside_india" };
  const digits = String(data.postcode ?? "").replace(/\D/g, "");
  const pincode = /^[1-9]\d{5}$/.test(digits) ? digits : "";
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { pincode, city: text(data.city) ?? text(data.locality), state: text(data.principalSubdivision) };
}
