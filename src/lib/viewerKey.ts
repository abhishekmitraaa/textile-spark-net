/**
 * A random id this browser keeps, so a signed-out visitor's view of a listing counts once a day however often
 * they open it (increment_product_view, 2026-10-17). It names nobody: a fresh random UUID, kept in localStorage.
 * Where storage is blocked it is a new one each page load, which only means such a visitor can count again.
 */
const KEY = "cosora.viewer";
let memo: string | null = null;

export function viewerKey(): string {
  if (memo) return memo;
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && /^[0-9a-f-]{36}$/.test(kept)) return (memo = kept);
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return (memo = fresh);
  } catch {
    return (memo = crypto.randomUUID());
  }
}
