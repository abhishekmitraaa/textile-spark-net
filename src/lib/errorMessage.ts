/**
 * The human-readable message of anything a `catch` can receive.
 *
 * Supabase does NOT throw `Error`s: `const { error } = await supabase…; if
 * (error) throw error;` throws a PostgrestError / StorageError / AuthError-shaped
 * PLAIN OBJECT (`error instanceof Error === false`, verified against
 * @supabase/supabase-js 2.110). The pattern this replaces —
 * `e instanceof Error ? e.message : String(e)` — therefore rendered
 * "[object Object]" for every database refusal, in 42 toasts: a vendor refused
 * by the lead cap, or quoting a closed request, was never told why. Found by
 * the Master Prompt 12 Part F Playwright run (tests/mp12-sourcing-loop.spec.ts).
 *
 * Order: a real Error's message; an object's string `message` (Postgrest,
 * Storage, Auth, Functions errors); a string as-is; anything else stringified.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  if (typeof e === "string") return e;
  return String(e);
}
