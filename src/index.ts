import { createServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";

/**
 * Resolve a TLS value: if it looks like a PEM string, use it directly.
 * Otherwise treat it as a file path and read the file.
 */
function resolvePem(value: string): Buffer {
  if (value.includes("-----BEGIN ")) {
    // Handle escaped newlines from .env files
    return Buffer.from(value.replace(/\\n/g, "\n"));
  }
  return readFileSync(value);
}
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

// Verify shared secret from CloudFront/Cloudflare on all /webhooks/* routes
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
// TLS Configuration
// ---------------------------------------------------------------------------

const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;
const TLS_CA = process.env.TLS_CA; // optional: Cloudflare origin CA or custom CA

function loadTls() {
  if (!TLS_CERT || !TLS_KEY) return null;

  try {
    const options: {
      cert: Buffer;
      key: Buffer;
      ca?: Buffer;
    } = {
      cert: resolvePem(TLS_CERT),
      key: resolvePem(TLS_KEY),
    };

    if (TLS_CA) {
      options.ca = resolvePem(TLS_CA);
    }

    return options;
  } catch (err) {
    console.error("Failed to load TLS config:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT) || 443;
const tls = loadTls();

if (tls) {
  const server = createServer(tls, app.fetch as any);
  server.listen(port, () => {
    console.log(`webhook-relay listening on :${port} (TLS)`);
  });
} else {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`webhook-relay listening on :${port} (plain HTTP)`);
  });
}
