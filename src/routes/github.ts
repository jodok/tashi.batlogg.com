import { Hono } from "hono";
import { verifyGitHubSignature } from "../verify.js";
import { notifyOpenClaw } from "../notify.js";
import { logEvent } from "../log.js";

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";

export const githubWebhook = new Hono();

githubWebhook.post("/", async (c) => {
  const body = await c.req.text();

  // Verify GitHub signature
  if (GITHUB_WEBHOOK_SECRET) {
    const sig = c.req.header("x-hub-signature-256");
    if (!verifyGitHubSignature(body, sig, GITHUB_WEBHOOK_SECRET)) {
      return c.json({ error: "invalid signature" }, 403);
    }
  }

  const event = c.req.header("x-github-event") ?? "unknown";

  let payload: Record<string, unknown>;
  try {
    // GitHub can send as application/json or application/x-www-form-urlencoded
    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("form-urlencoded")) {
      const params = new URLSearchParams(body);
      payload = JSON.parse(params.get("payload") ?? "{}");
    } else {
      payload = JSON.parse(body);
    }
  } catch {
    return c.json({ error: "invalid JSON payload" }, 400);
  }

  logEvent("github", `${event}.${payload.action ?? ""}`, payload);

  const message = formatEvent(event, payload);

  if (message) {
    console.log(
      JSON.stringify({
        source: "github",
        event,
        action: payload.action,
        message,
        timestamp: new Date().toISOString(),
      })
    );

    await notifyOpenClaw(message);
  }

  return c.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Event formatting
// ---------------------------------------------------------------------------

function formatEvent(
  event: string,
  payload: Record<string, unknown>
): string | null {
  const action = payload.action as string | undefined;
  const repo = (payload.repository as Record<string, unknown>)?.full_name;

  switch (event) {
    case "pull_request_review": {
      const review = payload.review as Record<string, unknown>;
      const pr = payload.pull_request as Record<string, unknown>;
      const reviewer = (review.user as Record<string, unknown>)?.login;
      const state = review.state as string;
      const prTitle = pr.title;
      const prNumber = pr.number;

      if (state === "approved") {
        return `PR #${prNumber} "${prTitle}" in ${repo} was approved by ${reviewer}`;
      }
      if (state === "changes_requested") {
        return `PR #${prNumber} "${prTitle}" in ${repo}: ${reviewer} requested changes`;
      }
      return null;
    }

    case "pull_request": {
      const pr = payload.pull_request as Record<string, unknown>;
      const prTitle = pr.title;
      const prNumber = pr.number;
      const author = (pr.user as Record<string, unknown>)?.login;

      if (action === "opened") {
        return `New PR #${prNumber} "${prTitle}" opened in ${repo} by ${author}`;
      }
      if (action === "closed" && pr.merged) {
        return `PR #${prNumber} "${prTitle}" merged in ${repo}`;
      }
      if (action === "closed") {
        return `PR #${prNumber} "${prTitle}" closed in ${repo}`;
      }
      return null;
    }

    case "issue_comment": {
      const issue = payload.issue as Record<string, unknown>;
      const comment = payload.comment as Record<string, unknown>;
      const commenter = (comment.user as Record<string, unknown>)?.login;
      const issueNumber = issue.number;
      const issueTitle = issue.title;

      if (action === "created") {
        const body = (comment.body as string)?.slice(0, 200);
        return `${commenter} commented on #${issueNumber} "${issueTitle}" in ${repo}: ${body}`;
      }
      return null;
    }

    default:
      return null;
  }
}
