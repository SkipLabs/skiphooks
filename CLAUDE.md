# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Skiphooks is a GitHub webhook server that forwards repository events (PRs, issues, pushes, releases, comments) to Slashwork streams via GraphQL. Built with Bun — no Node.js, no Express, no runtime dependencies.

## Commands

```sh
bun install          # Install dependencies
bun run dev          # Dev server with --watch
bun run start        # Production server
bun test             # Run all tests
bun test --filter "handler"  # Run specific tests
bunx tsc --noEmit    # Type-check without emitting
./test-webhook.sh skipper     # Send test webhook to a route
./test-webhook.sh skjs http://localhost:3000  # Custom base URL
```

## Bun Rules

Default to Bun for everything. Bun auto-loads `.env` — don't use dotenv.

- `Bun.serve()` for HTTP — don't use Express
- `bun:test` for testing — don't use Jest/Vitest
- `Bun.file` over `node:fs` readFile/writeFile
- `bun install` / `bun run` / `bunx` — not npm/yarn/npx

## Architecture

**Request flow:** `Bun.serve() → route match → signature verify → handler dispatch → format markdown → GraphQL post`

### Entry point: `src/index.ts`

`Bun.serve()` matches URLs via regex `/github/<route-name>`. Routes are defined in root `config.ts`. On each request: verify HMAC-SHA256 signature, look up handler by `x-github-event` header, check action relevance, format to markdown, POST to Slashwork GraphQL.

### Config: root `config.ts` + `src/config.ts`

Two-level config system:
- **`src/config.ts`** — types (`SkiphooksConfig`, `GroupConfig`, `RouteConfig`) and `loadConfig()` with validation
- **Root `config.ts`** — runtime config instance with actual values

Routes support two modes:
- **Group-based:** `{ group: "skipper" }` — references a named group in `config.groups` that provides `id` and `authToken`
- **Direct stream:** `{ streamId: "...", authToken: "..." }` — standalone stream config

### Handlers: `src/handlers/`

Each handler implements `EventHandler` interface (`types.ts`):
- `isRelevantAction(action?)` — filters which GitHub actions to process
- `format(payload)` — returns `{ markdown: string }` for Slashwork

Handlers: `pull-request.ts`, `issues.ts`, `issue-comment.ts`, `push.ts`, `release.ts`

### Slashwork client: `src/slashwork.ts`

GraphQL client with Bearer token auth. `postToSlashwork()` sends formatted markdown to a target stream/group. `validateConnection()` checks auth on startup.

### Webhook verification: `src/webhook.ts`

HMAC-SHA256 signature verification using `node:crypto`. Compares `x-hub-signature-256` header against computed hash.

## Environment Variables

See `.env.example`. Key vars:
- `GITHUB_WEBHOOK_SECRET` — shared secret for webhook signature verification
- `SLASHWORK_GRAPHQL_URL` — GraphQL endpoint
- `SLASHWORK_AUTH_TOKEN_SKIPPER` / `SLASHWORK_AUTH_TOKEN_SKJS` — per-group auth tokens
- `PORT` — server port (default 3000)

## Deployment

Clever Cloud via GitHub Actions. Push to `main` → typecheck + tests → auto-deploy.
