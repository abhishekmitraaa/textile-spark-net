import { useCallback, useState } from "react";

// A nudge the person closed stays closed on this device for 30 days, per account (2026-11-19, review M-54: "Add your
// state" came back on every visit to Profile and My Quotes).

const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const keyFor = (name: string, userId: string | null | undefined) => `cosora.dismissed.${name}:${userId ?? "guest"}`;

function readDismissed(name: string, userId: string | null | undefined): boolean {
  try {
    const at = Number(localStorage.getItem(keyFor(name, userId)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DAYS_30;
  } catch {
    return false;
  }
}

export function useDismissed(name: string, userId: string | null | undefined): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => readDismissed(name, userId));
  const [forUser, setForUser] = useState(userId);
  if (forUser !== userId) {
    setForUser(userId);
    setDismissed(readDismissed(name, userId));
  }
  const dismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(keyFor(name, userId), String(Date.now())); } catch { /* private mode: this visit only */ }
  }, [name, userId]);
  return [dismissed, dismiss];
}
