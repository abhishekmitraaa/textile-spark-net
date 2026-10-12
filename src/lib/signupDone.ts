// Sign-up's screens stay in the browser's history under Home: Login, the code
// screen, Role, Sub-role, Account Information, Interest Preference and Terms are
// each a pushed entry. So the device's back button, pressed on Home, reopened
// the Terms agreement a buyer had just accepted, and behind it the rest.
//
// The fix is a note that this account finished sign-up in this tab, which
// SignupStep reads to send those entries on to Home. sessionStorage, because
// history belongs to the tab too; keyed to the account, so a second account
// signing up in the same tab still gets every step.
const KEY = "cosora.signupDone";

export function markSignupDone(userId: string | undefined): void {
  if (!userId) return;
  try { sessionStorage.setItem(KEY, userId); } catch { /* private mode */ }
}

/** The account that finished sign-up in this tab, or null. */
export function signupDoneFor(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
