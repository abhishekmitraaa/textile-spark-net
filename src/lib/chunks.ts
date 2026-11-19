/** Ids in groups small enough for a GET URL (claude.md: never put a long id list in one request). */
export function chunks<T>(xs: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** PostgREST's largest answer: a read that gets this many rows may have been cut. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Every row of an ordered read, a page at a time (POSTGREST_MAX_ROWS each), until a page comes back short. `page`
 * runs the read for rows `from`..`to`; give the query a stable order (a unique column last), or rows can repeat or
 * go missing between pages.
 */
export async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += POSTGREST_MAX_ROWS) {
    const { data, error } = await page(from, from + POSTGREST_MAX_ROWS - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < POSTGREST_MAX_ROWS) return out;
  }
}
