// ─────────────────────────────────────────────────────────────
// Phone-number helpers shared by the mobile + OTP sign-in (Login.tsx), the
// mobile + OTP signup (Register.tsx) and the code-entry screen (OtpVerify.tsx).
// Pure — no network. Sending and verifying codes lives in ./otp.ts only.
// ─────────────────────────────────────────────────────────────

export interface CountryCode {
  flag: string;
  code: string;
  name: string;
}

// The list the original OTP login shipped with, unchanged. India first: it is
// the default.
export const COUNTRY_CODES: CountryCode[] = [
  { flag: "🇮🇳", code: "+91",  name: "India" },
  { flag: "🇨🇳", code: "+86",  name: "China" },
  { flag: "🇹🇼", code: "+886", name: "Taiwan" },
  { flag: "🇯🇵", code: "+81",  name: "Japan" },
  { flag: "🇺🇸", code: "+1",   name: "United States" },
  { flag: "🇭🇰", code: "+852", name: "Hong Kong" },
  { flag: "🇦🇺", code: "+61",  name: "Australia" },
  { flag: "🇨🇦", code: "+1",   name: "Canada" },
  { flag: "🇻🇳", code: "+84",  name: "Vietnam" },
  { flag: "🇬🇧", code: "+44",  name: "United Kingdom" },
  { flag: "🇹🇭", code: "+66",  name: "Thailand" },
  { flag: "🇦🇷", code: "+54",  name: "Argentina" },
];

/** The national-number length the entry field accepts (as the original UI did). */
export const PHONE_DIGITS = 10;

/** Keep only digits, capped at PHONE_DIGITS — what the phone field stores. */
export function cleanPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PHONE_DIGITS);
}

/** "+91" + "9876543210" → "+919876543210" (E.164, what the auth API takes). */
export function toE164(countryCode: string, digits: string): string {
  return `${countryCode}${cleanPhoneDigits(digits)}`;
}

/** "+91-9876XXXXX", as the original OTP screen showed it. */
export function maskPhone(digits: string, countryCode: string): string {
  if (digits.length < 4) return `${countryCode}${digits}`;
  return `${countryCode}-${digits.slice(0, 4)}XXXXX`;
}
