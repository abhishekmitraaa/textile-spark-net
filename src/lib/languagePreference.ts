// The UI language follows the account, not just the device (2026-09-26).
//
// Saved in the user's auth metadata as `ui_language` ("en" | "hi" | "gu"). It is
// private to the user, needs no table, and arrives with the session, so the
// language can be applied the moment someone signs in on any device. Before
// this, the choice lived only in this browser's localStorage; the buyer's
// Regional Settings wrote buyer_profiles.regional.language and nothing read it,
// and Vendor Settings wrote vendor_profiles.regional.language and read it back
// only on its own page — where a vendor who had never saved one got the
// default, English, over whatever they had picked.
//
// Rules:
//   • Every language picker calls chooseLang(). Signed in, it saves to the
//     account. Signed out, it switches this device and remembers the pick for
//     this tab, so choosing on the sign-in screen and then signing in keeps it.
//   • At sign-in (and on every load with a session) syncLanguageForUser()
//     applies the account's language; a pick made while signed out in this tab
//     is newer, so it is saved to the account instead.
//   • An account with no saved language keeps the device's. Nothing is saved
//     on its behalf: a default is not a choice.
// This is a preference read after sign-in. It is not part of signing in.

import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isLang, setLang, type Lang } from "@/lib/i18n";

const SIGNED_OUT_PICK = "cosora.lang.pickedSignedOut";

export function accountLang(user: User | null | undefined): Lang | null {
  const v = user?.user_metadata?.ui_language;
  return isLang(v) ? v : null;
}

async function saveToAccount(l: Lang): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { ui_language: l } });
  if (error) throw error;
}

/**
 * A person chose a language. Switches the app now; saves it to the account when
 * signed in. Rejects only when that save fails (the app has switched anyway).
 */
export async function chooseLang(l: Lang): Promise<void> {
  setLang(l);
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    try { sessionStorage.setItem(SIGNED_OUT_PICK, l); } catch { /* private mode */ }
    return;
  }
  try { sessionStorage.removeItem(SIGNED_OUT_PICK); } catch { /* ignore */ }
  if (accountLang(user) !== l) await saveToAccount(l);
}

/** Apply the signed-in account's language (see the rules above). */
export async function syncLanguageForUser(user: User): Promise<void> {
  let picked: string | null = null;
  try {
    picked = sessionStorage.getItem(SIGNED_OUT_PICK);
    sessionStorage.removeItem(SIGNED_OUT_PICK);
  } catch { /* private mode */ }

  if (isLang(picked)) {
    setLang(picked);
    if (accountLang(user) !== picked) await saveToAccount(picked);
    return;
  }
  const saved = accountLang(user);
  if (saved) setLang(saved);
}
