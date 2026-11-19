import { cleanPhoneDigits, COUNTRY_CODES, isCompletePhone, toE164 } from "@/lib/auth/phone";

// The phone number on a buyer's profile is what a seller dials (call_buyer_contact), so it is stored as E.164 and
// checked before it is saved (2026-11-19, review M-47: it was free text). The database checks the same shape
// (admin.profiles_phone_check, migration 20261119120000). Sign-in's own number is not this field and is unchanged.

const INDIA = COUNTRY_CODES[0];
const E164 = /^\+[1-9]\d{7,14}$/;

/** "+91 99113 11001", "099113 11001", "9911311001" → "+919911311001"; "+852 1234 5678" → "+85212345678"; else null. */
export function normalizeContactPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    const e164 = `+${trimmed.replace(/\D/g, "")}`;
    if (!E164.test(e164)) return null;
    // An Indian number written with +91 must still be a whole Indian number.
    if (e164.startsWith("+91") && e164.length !== 13) return null;
    return e164;
  }
  const digits = cleanPhoneDigits(trimmed, INDIA);
  return isCompletePhone(digits, INDIA) && trimmed.replace(/\D/g, "").replace(/^0+/, "").length <= 12 ? toE164(INDIA.code, digits) : null;
}
