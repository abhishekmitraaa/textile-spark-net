import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The text of the repo's .env, or — where there is none (CI) — the same KEY=value lines built from the process
 * environment, so a spec that parses .env at import time loads either way and skips on a missing credential instead
 * of crashing the whole run (CI's E2E job died on "ENOENT … .env" before any test ran, 2026-11-27).
 */
export function readEnvText(root: string): string {
  const file = path.join(root, ".env");
  if (existsSync(file)) return readFileSync(file, "utf8");
  return Object.entries(process.env)
    .filter(([k, v]) => v != null && /^[A-Z][A-Z0-9_]*$/.test(k))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
