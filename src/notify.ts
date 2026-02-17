/**
 * Forward events to OpenClaw via cron wake API.
 */

const OPENCLAW_URL =
  process.env.OPENCLAW_URL || "http://127.0.0.1:18789";
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || "";

export async function notifyOpenClaw(message: string): Promise<void> {
  if (!OPENCLAW_TOKEN) {
    console.log("[notify] OPENCLAW_TOKEN not set, skipping notification");
    return;
  }

  try {
    const res = await fetch(`${OPENCLAW_URL}/hooks/wake`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({
        text: message,
        mode: "now",
      }),
    });

    if (!res.ok) {
      console.error(
        `[notify] OpenClaw wake failed: ${res.status} ${await res.text()}`
      );
    } else {
      console.log(`[notify] OpenClaw wake sent: ${message.slice(0, 80)}`);
    }
  } catch (err) {
    console.error("[notify] OpenClaw wake error:", err);
  }
}
