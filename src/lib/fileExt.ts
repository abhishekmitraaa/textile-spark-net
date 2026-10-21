/**
 * A file name's extension, safe in a Storage path: 1–8 lower-case letters or digits, else the fallback.
 *
 * A listing's, catalogue's or video's Storage address must be plain (migration 20261021100000,
 * `storage_url_plain`): letters, digits, '.', '_' and '-'. `name.split(".").pop()` gave a name with no dot
 * back whole ("my photo"), spaces and all, which the database would refuse.
 */
export function fileExt(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}
