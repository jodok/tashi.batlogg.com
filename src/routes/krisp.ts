import { Hono } from "hono";
import { notifyOpenClaw } from "../notify.js";

const KRISP_WEBHOOK_SECRET = process.env.KRISP_WEBHOOK_SECRET ?? "";

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

  // Temporary: log raw payload for unmapped event types
  if ((payload.event as string) === "action_items_generated") {
    console.log("[krisp] action_items raw:", JSON.stringify(payload).slice(0, 3000));
  }

  // Log but don't forward to OpenClaw for now
  console.log(
    JSON.stringify({
      source: "krisp",
      event: payload.event ?? "meeting_note",
      timestamp: new Date().toISOString(),
    })
  );

  return c.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatKrispEvent(payload: Record<string, unknown>): string | null {
  const event = payload.event as string ?? "unknown";
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const meeting = (data.meeting ?? {}) as Record<string, unknown>;
  const content = data.content as Array<Record<string, unknown>> | undefined;

  const title = (meeting.title as string) || "Untitled meeting";
  const startDate = meeting.start_date as string ?? "";
  const endDate = meeting.end_date as string ?? "";
  const duration = meeting.duration as number ?? 0;
  const url = meeting.url as string ?? "";

  const participants = (meeting.participants as Array<Record<string, unknown>> ?? [])
    .map((p) => p.first_name ? `${p.first_name} ${p.last_name ?? ""}`.trim() : p.email)
    .filter(Boolean)
    .join(", ");

  const durationMin = duration > 0 ? `${Math.round(duration / 60)} min` : "";

  const parts: string[] = [`Krisp: "${title}" (${event})`];

  if (startDate) parts.push(`Time: ${startDate}`);
  if (durationMin) parts.push(`Duration: ${durationMin}`);
  if (participants) parts.push(`Participants: ${participants}`);
  if (url) parts.push(`URL: ${url}`);

  if (!content || content.length === 0) return parts.join("\n");

  if (event === "key_points_generated") {
    // content is array of { id, description }
    const points = content
      .map((c) => (c.description as string) ?? "")
      .filter(Boolean)
      .join("\n\n");
    if (points) {
      const truncated = points.length > 3000
        ? points.slice(0, 3000) + "... [truncated]"
        : points;
      parts.push(`\nKey Points:\n${truncated}`);
    }
  } else if (event === "transcript_created") {
    // content is array of { speaker, text }
    const lines = content
      .map((c) => `${c.speaker}: ${c.text}`)
      .join("\n");
    const truncated = lines.length > 4000
      ? lines.slice(0, 4000) + "... [truncated]"
      : lines;
    parts.push(`\nTranscript:\n${truncated}`);
  } else {
    // Generic: dump content descriptions or text
    const text = content
      .map((c) => (c.description as string) ?? (c.text as string) ?? "")
      .filter(Boolean)
      .join("\n");
    if (text) parts.push(`\nContent:\n${text.slice(0, 3000)}`);
  }

  return parts.join("\n");
}
