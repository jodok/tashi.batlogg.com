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
| `PORT` | Server port (default: 3456) |
| `WEBHOOK_SECRET` | Shared secret sent by CloudFront in `X-Webhook-Secret` header |
| `GITHUB_WEBHOOK_SECRET` | GitHub HMAC secret for signature verification |

## CloudFront Configuration

1. Create a CloudFront distribution for `tashi.namche.ai`
2. Origin: your server IP/hostname, port 3456, HTTP only
3. Add a custom origin header: `X-Webhook-Secret: <your-secret>`
4. Cache policy: CachingDisabled
5. Origin request policy: AllViewer

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
