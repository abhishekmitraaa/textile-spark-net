// ─────────────────────────────────────────────────────────────
// Phone-number helpers shared by the mobile + OTP sign-in (Login.tsx), the
// mobile + OTP signup (Register.tsx) and the code-entry screen (OtpVerify.tsx).
// Pure — no network. Sending and verifying codes lives in ./otp.ts only.
// ─────────────────────────────────────────────────────────────

export interface CountryCode {
  flag: string;
  code: string;
  name: string;
  /** Digits in a mobile number after the country code, without a leading 0. */
  digits: number;
}

// The list the original OTP login shipped with, unchanged. India first: it is
// the default. Each country takes its own number length (2026-10-19): the field
// took exactly 10 digits everywhere, so a Hong Kong (8), Australian or Thai (9)
// number couldn't be entered, and an 11-digit Chinese one was cut to a different
// number. Sign-in itself is unchanged; otp-dev-verify accepts any E.164 length.
export const COUNTRY_CODES: CountryCode[] = [
  { flag: "🇮🇳", code: "+91",  name: "India",          digits: 10 },
  { flag: "🇨🇳", code: "+86",  name: "China",          digits: 11 },
  { flag: "🇹🇼", code: "+886", name: "Taiwan",         digits: 9 },
  { flag: "🇯🇵", code: "+81",  name: "Japan",          digits: 10 },
  { flag: "🇺🇸", code: "+1",   name: "United States",  digits: 10 },
  { flag: "🇭🇰", code: "+852", name: "Hong Kong",      digits: 8 },
  { flag: "🇦🇺", code: "+61",  name: "Australia",      digits: 9 },
  { flag: "🇨🇦", code: "+1",   name: "Canada",         digits: 10 },
  { flag: "🇻🇳", code: "+84",  name: "Vietnam",        digits: 9 },
  { flag: "🇬🇧", code: "+44",  name: "United Kingdom", digits: 10 },
  { flag: "🇹🇭", code: "+66",  name: "Thailand",       digits: 9 },
  { flag: "🇦🇷", code: "+54",  name: "Argentina",      digits: 10 },
];

/** India's length, the default when no country is given. */
export const PHONE_DIGITS = 10;

/** How many digits the field takes for this country. */
export function phoneDigitsFor(country?: Pick<CountryCode, "digits"> | null): number {
  return country?.digits ?? PHONE_DIGITS;
}

/** Keep only digits, capped at the country's length — what the phone field stores. */
export function cleanPhoneDigits(raw: string, country?: Pick<CountryCode, "digits"> | null): string {
  return raw.replace(/\D/g, "").slice(0, phoneDigitsFor(country));
}

/** A whole number for this country: exactly its length. */
export function isCompletePhone(digits: string, country?: Pick<CountryCode, "digits"> | null): boolean {
  return digits.length === phoneDigitsFor(country);
}

/** "+91" + "9876543210" → "+919876543210" (E.164, what the auth API takes). The field already capped the length. */
export function toE164(countryCode: string, digits: string): string {
  return `${countryCode}${digits.replace(/\D/g, "")}`;
}

/** "+91-9876XXXXX", as the original OTP screen showed it. */
export function maskPhone(digits: string, countryCode: string): string {
  if (digits.length < 4) return `${countryCode}${digits}`;
  return `${countryCode}-${digits.slice(0, 4)}XXXXX`;
}
