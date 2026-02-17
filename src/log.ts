import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = process.env.LOG_DIR ?? "logs";

/**
 * Append a JSON line to logs/<source>/YYMMDD.jsonl
 */
export function logEvent(
  source: string,
  event: string,
  payload: unknown
): void {
  const dir = join(LOG_DIR, source);
  mkdirSync(dir, { recursive: true });

  const now = new Date();
  const date =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const entry = JSON.stringify({
    event,
    timestamp: now.toISOString(),
    payload,
  });

  appendFileSync(join(dir, `${date}.jsonl`), entry + "\n");

  console.log(`[${source}] ${event} @ ${now.toISOString()}`);
}
