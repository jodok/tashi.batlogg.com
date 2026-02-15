# Webhook Relay

Receives webhooks from external services and forwards events to OpenClaw.

## Architecture

```
External service (GitHub, HubSpot, ...)
  → tashi.namche.ai (CloudFront, SSL termination)
    → origin (VPS or dynamic IP with port forwarding)
      → this service (default port 3456)
        → OpenClaw (via wake event or sessions API)
```

## Setup

```bash
cd webhook-relay
npm install
cp .env.example .env
# Edit .env with your secrets
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 443) |
| `WEBHOOK_SECRET` | Shared secret sent by CloudFront/Cloudflare in `X-Webhook-Secret` header |
| `GITHUB_WEBHOOK_SECRET` | GitHub HMAC secret for signature verification |
| `TLS_CERT` | Path to TLS certificate file (PEM) |
| `TLS_KEY` | Path to TLS private key file (PEM) |
| `TLS_CA` | Optional: CA certificate (e.g. Cloudflare Origin CA root) |

If `TLS_CERT` and `TLS_KEY` are set, the server starts with HTTPS. Otherwise plain HTTP.

## Cloudflare Configuration

1. Add DNS record for `tashi.namche.ai` pointing to your server (proxied or DNS-only)
2. SSL/TLS mode: Full (Strict)
3. Create an Origin Certificate in Cloudflare dashboard (SSL/TLS → Origin Server)
4. Install cert and key on the server, set `TLS_CERT` and `TLS_KEY`
5. Optionally set `TLS_CA` to the Cloudflare Origin CA root for chain validation
6. Add a custom request header in a Transform Rule: `X-Webhook-Secret: <your-secret>`
7. Cache: bypass (Cache Rules or Page Rule with "Cache Level: Bypass")

## Adding a New Webhook Source

1. Create `src/routes/<source>.ts` with a Hono router
2. Add signature verification if the service supports it
3. Format events into human-readable messages
4. Register the route in `src/index.ts`

## GitHub Webhook Setup

1. Go to repo Settings → Webhooks → Add webhook
2. Payload URL: `https://tashi.namche.ai/webhooks/github`
3. Content type: `application/json`
4. Secret: same value as `GITHUB_WEBHOOK_SECRET`
5. Events: Pull requests, Pull request reviews, Issue comments

## Supported Events

### GitHub

| Event | Actions | Description |
|-------|---------|-------------|
| `pull_request_review` | approved, changes_requested | PR review notifications |
| `pull_request` | opened, closed, merged | PR lifecycle |
| `issue_comment` | created | Comments on issues/PRs |

### HubSpot

Placeholder — not yet implemented.
