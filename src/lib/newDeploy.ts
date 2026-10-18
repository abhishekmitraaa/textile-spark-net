// A page file that a deploy replaced while the tab was open (2026-10-18): see AppErrorBoundary.

const RELOAD_KEY = "cosora.chunkReloadAt";

/** A page's script failed to load: usually a deploy replaced it while the tab was open. */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(text);
}

/**
 * Reload the page to pick up a new deploy, at most once every 30 seconds, so a file that is really
 * missing can't put the tab in a reload loop. Returns false when it held back.
 */
export function reloadOnceForNewDeploy(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway; the browser's own back-off is the guard.
  }
  window.location.reload();
  return true;
}
