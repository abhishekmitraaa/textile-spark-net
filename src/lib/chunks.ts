/** Ids in groups small enough for a GET URL (claude.md: never put a long id list in one request). */
export function chunks<T>(xs: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
