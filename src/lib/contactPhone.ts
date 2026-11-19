

// The phone number on a buyer's profile is what a seller dials (call_buyer_contact), so it is stored as E.164 and
// checked before it is saved (2026-11-19, review M-47: it was free text). The database checks the same shape
// (admin.profiles_phone_check, migration 20261119120000). Sign-in's own number is not this field and is unchanged.

const E164 = /^\+[1-9]\d{7,14}$/;

/** "+91 99113 11001", "099113 11001", "9911311001" → "+919911311001"; "+852 1234 5678" → "+85212345678"; else null. */
export function normalizeContactPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const e164 = `+${trimmed.replace(/\D/g, "")}`;
    if (!E164.test(e164)) return null;
    // An Indian number written with +91 must still be a whole Indian number.
    if (e164.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(e164)) return null;
    return e164;
  }
  // Without a +: an Indian mobile number, exactly 10 digits, possibly written with a leading 0 or 91. A longer or shorter
  // number is refused, never cut to fit (code review 2026-11-19: "99113110012" was saved as a different number).
  let digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
