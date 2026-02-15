import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { githubWebhook } from "./routes/github.js";
import { hubspotWebhook } from "./routes/hubspot.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use("*", logger());

// Verify shared secret from CloudFront on all /webhooks/* routes
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.use("/webhooks/*", async (c, next) => {
  if (WEBHOOK_SECRET) {
    const header = c.req.header("x-webhook-secret");
    if (header !== WEBHOOK_SECRET) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }
  await next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/webhooks/github", githubWebhook);
app.route("/webhooks/hubspot", hubspotWebhook);

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT) || 3456;

serve({ fetch: app.fetch, port }, () => {
  console.log(`webhook-relay listening on :${port}`);
});
