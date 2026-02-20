import { createServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { githubWebhook } from "./routes/github.js";
import { hubspotWebhook } from "./routes/hubspot.js";
import { krispWebhook } from "./routes/krisp.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use("*", logger());

// Verify shared secret on all /api/webhooks/* routes
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.use("/api/webhooks/*", async (c, next) => {
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

// Legacy webhook paths redirect to /api/webhooks/*
app.all("/webhooks/*", (c) => {
  const newPath = `/api${c.req.path}`;
  return c.redirect(newPath, 308);
});

// Webhooks under /api/webhooks/
app.route("/api/webhooks/github", githubWebhook);
app.route("/api/webhooks/hubspot", hubspotWebhook);
app.route("/api/webhooks/krisp", krispWebhook);

// Serve static files from public/
const __dirname = dirname(fileURLToPath(import.meta.url));
app.use("/*", serveStatic({ root: resolve(__dirname, "..", "public") }));

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

const port = Number(process.env.PORT) || 8443;
const host = "0.0.0.0";
const tls = loadTls();

if (tls) {
  serve(
    { fetch: app.fetch, port, hostname: host, createServer: createServer, serverOptions: tls },
    () => {
      console.log(`webhook-relay listening on ${host}:${port} (TLS)`);
    }
  );
} else {
  serve({ fetch: app.fetch, port, hostname: host }, () => {
    console.log(`webhook-relay listening on ${host}:${port} (plain HTTP)`);
  });
}
