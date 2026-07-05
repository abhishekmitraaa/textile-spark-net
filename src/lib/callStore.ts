import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────
// Tiny store for the desktop "show the number on screen" dialog.
//
// On mobile, Call Now opens the native dialer (`tel:`). On desktop `tel:`
// usually does nothing, so instead we surface the number in a modal the user
// can read / copy / click. This store holds the number to display.
// ─────────────────────────────────────────────────────────────

export interface CallInfo {
  name: string;
  phone: string;
}

let pending: CallInfo | null = null;
const listeners = new Set<() => void>();

export function openCallNumber(info: CallInfo) {
  pending = info;
  listeners.forEach((l) => l());
}
export function closeCallNumber() {
  pending = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function useCallNumber(): CallInfo | null {
  return useSyncExternalStore(subscribe, () => pending, () => pending);
}
