# AGENTS.md — openclaw-webhooks

## Project

Webhook relay service for OpenClaw. Receives webhooks from external services (GitHub, HubSpot, etc.) and forwards events to OpenClaw.

Built with Hono + TypeScript.

## Language

Everything in English. Code, docs, commit messages.

## Git Workflow

1. Always `git pull origin main` before starting work
2. Create a feature branch with `tashi/` prefix (`git checkout -b tashi/<branch-name>`)
3. Commit and push to the branch
4. Open a pull request on GitHub (`gh pr create`)
5. Wait for Jodok's approval
6. After approval, merge to main (`gh pr merge --squash`)

Never commit directly to main.

## Development

Use OpenAI Codex (via `sessions_spawn` with `model: codex`) for coding tasks.

```bash
npm install
cp .env.example .env
npm run dev        # dev server with hot reload
npm run typecheck  # verify TypeScript
npm run build      # compile to dist/
npm start          # run compiled version
```

## Architecture

```
External service (GitHub, HubSpot, ...)
  → tashi.namche.ai (CloudFront, SSL termination)
    → origin (VPS or dynamic IP)
      → this service (default port 3456)
        → OpenClaw (via wake event or sessions API)
```

## Adding a Webhook Source

1. Create `src/routes/<source>.ts` with a Hono router
2. Add signature verification if the service supports it
3. Format events into human-readable messages
4. Register the route in `src/index.ts`

## Files

- `src/index.ts` — server, middleware, route registration
- `src/verify.ts` — HMAC signature verification
- `src/routes/github.ts` — GitHub webhook handling
- `src/routes/hubspot.ts` — HubSpot placeholder
- `.env.example` — environment variable documentation
