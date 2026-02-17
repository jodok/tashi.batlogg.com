import { Hono } from "hono";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { notifyOpenClaw } from "../notify.js";
import { logEvent } from "../log.js";

const KRISP_WEBHOOK_SECRET = process.env.KRISP_WEBHOOK_SECRET ?? "";
const DATA_DIR = process.env.KRISP_DATA_DIR ?? "data/krisp";

export const krispWebhook = new Hono();

krispWebhook.post("/", async (c) => {
  if (KRISP_WEBHOOK_SECRET) {
    const auth = c.req.header("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (token !== KRISP_WEBHOOK_SECRET) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }

  const body = await c.req.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

  const event = (payload.event as string) ?? "unknown";
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const meeting = (data.meeting ?? {}) as Record<string, unknown>;

  logEvent("krisp", event, payload);

  console.log(
    JSON.stringify({
      source: "krisp",
      event,
      title: meeting.title ?? "unknown",
      timestamp: new Date().toISOString(),
    })
  );

  const dir = ensureMeetingDir(meeting);
  storeRawPayload(dir, event, payload);
  storeMeetingMeta(dir, meeting);
  storeContent(dir, event, data);

  const summary = buildSummary(dir, meeting, event);
  if (summary) {
    await notifyOpenClaw(summary);
  }

  return c.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Directory & slug helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äáàâ]/g, "a")
    .replace(/[öóòô]/g, "o")
    .replace(/[üúùû]/g, "u")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function meetingDirName(meeting: Record<string, unknown>): string {
  const startDate = meeting.start_date as string ?? "";
  const title = (meeting.title as string) ?? "untitled";

  // Extract date as YYMMDD
  const iso = startDate ? startDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const date = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);

  return `${date}-${slugify(title)}`;
}

function ensureMeetingDir(meeting: Record<string, unknown>): string {
  const dir = join(DATA_DIR, meetingDirName(meeting));
  mkdirSync(join(dir, "raw"), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function storeRawPayload(
  dir: string,
  event: string,
  payload: Record<string, unknown>
): void {
  const file = join(dir, "raw", `${event}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2));
}

function storeMeetingMeta(
  dir: string,
  meeting: Record<string, unknown>
): void {
  const file = join(dir, "meeting.json");

  // Merge with existing (earlier events may have partial data)
  let existing: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      existing = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      // ignore
    }
  }

  const merged = { ...existing, ...meeting };
  writeFileSync(file, JSON.stringify(merged, null, 2));
}

function storeContent(
  dir: string,
  event: string,
  data: Record<string, unknown>
): void {
  const content = data.content as Array<Record<string, unknown>> | undefined;
  if (!content || content.length === 0) return;

  switch (event) {
    case "transcript_created": {
      const lines = content
        .map((c) => `**${c.speaker}:** ${c.text}`)
        .join("\n\n");
      writeFileSync(join(dir, "transcript.md"), lines);
      break;
    }

    case "key_points_generated": {
      const points = content
        .map((c) => `- ${(c.description as string) ?? ""}`)
        .filter((l) => l !== "- ")
        .join("\n");
      writeFileSync(join(dir, "key-points.md"), points);
      break;
    }

    case "action_items_generated": {
      const items = content
        .map((c) => `- [ ] ${(c.description as string) ?? (c.text as string) ?? ""}`)
        .filter((l) => l !== "- [ ] ")
        .join("\n");
      writeFileSync(join(dir, "action-items.md"), items);
      break;
    }

    default: {
      // Unknown event type: store as generic content
      const text = content
        .map((c) => (c.description as string) ?? (c.text as string) ?? "")
        .filter(Boolean)
        .join("\n\n");
      if (text) {
        writeFileSync(join(dir, `${event}.md`), text);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

function buildSummary(
  dir: string,
  meeting: Record<string, unknown>,
  event: string
): string | null {
  const title = (meeting.title as string) || "Untitled meeting";
  const startDate = meeting.start_date as string ?? "";
  const duration = meeting.duration as number ?? 0;
  const durationMin = duration > 0 ? `${Math.round(duration / 60)} min` : "";

  const participants = (
    meeting.participants as Array<Record<string, unknown>> ?? []
  )
    .map((p) =>
      p.first_name
        ? `${p.first_name} ${p.last_name ?? ""}`.trim()
        : p.email
    )
    .filter(Boolean)
    .join(", ");

  const parts: string[] = [`Krisp meeting: "${title}" (${event})`];
  if (startDate) parts.push(`Time: ${startDate}`);
  if (durationMin) parts.push(`Duration: ${durationMin}`);
  if (participants) parts.push(`Participants: ${participants}`);
  parts.push(`Data: ${dir}`);

  // List available files
  const files: string[] = [];
  if (existsSync(join(dir, "transcript.md"))) files.push("transcript");
  if (existsSync(join(dir, "key-points.md"))) files.push("key-points");
  if (existsSync(join(dir, "action-items.md"))) files.push("action-items");
  if (files.length > 0) parts.push(`Available: ${files.join(", ")}`);

  return parts.join("\n");
}
