# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Skiphooks is a Next.js 15 full-stack app that:
1. Receives GitHub webhooks and forwards them to Slashwork groups via GraphQL
2. Provides AI-powered weekly summaries and cross-group digests (Anthropic Claude)
3. Auto-discovers Slashwork groups and syncs them to a local DB
4. Polls Google Calendar for event reminders

## Commands

```sh
bun install                             # Install dependencies
bun run dev                             # Next.js dev server
bun run build                           # Production build
bun test                                # Run all tests
bun test --filter "handler"             # Match test file name
bun test src/calendar/calendar.test.ts  # Run single file
bunx tsc --noEmit                       # Type-check without emitting
./test-webhook.sh skipper               # Send test webhook to a route
./summarize-group.sh skjs week10        # CLI: summarize a group's week
```

## Bun Rules

Default to Bun for everything. Bun auto-loads `.env` — don't use dotenv.

- `bun:test` for testing — don't use Jest/Vitest
- `bun install` / `bun run` / `bunx` — not npm/yarn/npx

## Architecture

### Next.js App (`app/`)

Pages and API routes live in `app/`. Clerk auth protects all pages except webhooks and health check.

**Pages:**
- `/slashwork` — Database state viewer (auth tokens, groups, routes, discovered groups, digest status)
- `/summary` — Per-group weekly summary with AI (pick group, week, prompt → summarize → publish)
- `/digest` — Cross-group weekly digest (config, manual trigger, auto-post toggle)
- `/scout` — Reddit Scout dashboard

**API routes:**
- `POST /github/[route]` — GitHub webhook receiver (signature verify → handler → Slashwork post)
- `POST /api/summary` — Generate single-group summary (accepts `groupId` or `group` name)
- `POST /api/summary/publish` — Publish summary to a group
- `GET/PUT /api/digest/config` — Digest configuration
- `POST /api/digest/run` — Generate cross-group digest
- `POST /api/digest/publish` — Publish digest to configured target group
- `GET /health` — Health check

### Database (`src/db.ts` + `migrations/`)

PostgreSQL via `pg` library. Connection string: `POSTGRESQL_ADDON_URI`. Migrations run automatically on startup via `instrumentation.ts`.

**Tables:** `auth_tokens`, `groups`, `routes`, `slashwork_groups` (discovered), `weekly_digest_config`, `calendar_users`, plus Scout tables.

Key functions: `resolveRouteFromDb()`, `getGroups()`, `getAuthToken()`, `getDiscoveredGroups()`, `getDigestConfig()`, `upsertDigestConfig()`

### Webhook Flow

`POST /github/[route]` → `resolveRouteFromDb(routeName)` → verify HMAC-SHA256 signature → look up handler by `x-github-event` → format to markdown → `postToSlashwork()`

### Handlers (`src/handlers/`)

Each implements `EventHandler` interface: `isRelevantAction(action?)` + `format(payload) → { markdown }`. Handlers: `pull-request.ts`, `pull-request-review.ts`, `issues.ts`, `issue-comment.ts`, `push.ts`, `release.ts`, `check-suite.ts`, `deployment-status.ts`, `workflow-run.ts`.

### Slashwork Client (`src/slashwork.ts`)

GraphQL client with Bearer token auth. `postToSlashwork(connection, streamId, markdown)`. `validateConnection()` checks auth on startup.

### Summary & Digest (`src/summary-utils.ts`, `src/weekly-digest.ts`)

Shared utilities for fetching and formatting Slashwork posts:
- `fetchGroupPosts(graphqlUrl, authToken, groupId, start, end)` — paginated post fetcher (up to 10 pages of 100)
- `formatPosts(posts)` — hierarchical text formatting (post → comments → replies)
- `generateDigest()` — per-group summaries via Haiku, then meta-summary
- `computeDigestWindow()` — Thursday 2pm UTC → next Thursday 2pm UTC

### Pollers (`instrumentation.ts`)

Three background tasks started on app boot:
1. **Route validation** — validates all Slashwork auth tokens
2. **Group sync** (`src/slashwork-sync.ts`) — discovers all Slashwork groups via `groupSearch` API every 24h
3. **Weekly digest** (`src/weekly-digest.ts`) — checks hourly, auto-posts digest every Thursday at 2pm UTC

### Calendar (`src/calendar/`)

Google Calendar polling that posts event reminders. Config from DB (`calendar_users` table). Requires `GOOGLE_SERVICE_ACCOUNT_KEY` env var.

### Skip Reactive Streams (`src/skip/`)

The `/slashwork` admin page uses Skip Runtime for real-time reactive data. Skip runs as a sidecar process on boot (started in `instrumentation.ts`) that watches PostgreSQL tables and streams changes to the browser via Server-Sent Events.

**Architecture:**
- `src/skip/service.ts` — defines the `SkipService` with four reactive collections (`authTokens`, `groups`, `routes`, `discoveredGroups`) backed by `@skip-adapter/postgres`
- `src/skip/postgres-adapter.ts` — `PostgresExternalService` connects to PostgreSQL and monitors the four tables via triggers
- `src/skip/broker.ts` — `SkipServiceBroker` singleton used by API routes to get stream URLs from the Skip control port
- `src/skip/parse-stream.ts` — applies incremental Skip SSE updates to a local `Map`
- `src/skip/skip-streams-provider.tsx` — React context that manages shared `EventSource` connections (one per stream name, shared across subscribers)
- `app/api/skip/*` — proxy routes that call the Skip broker to get stream URLs, then forward SSE from the Skip streaming port to the browser. `/api/skip/batch` returns all four URLs at once.

**Startup:** `instrumentation.ts` calls `cleanupOrphanSkipTriggers()` (drops leftover pg triggers from a prior run), then `runService(skipService, { streaming_port, control_port })`, then starts a watchdog that exits the process after 5 consecutive health-check failures (triggering a platform restart).

**Ports:** `SKIP_STREAMING_PORT` (default 8079) for SSE, `SKIP_CONTROL_PORT` (default 8078) for broker/healthz.

### Admin API (`app/api/admin/`)

- `GET/POST /api/admin/routes` — list / create webhook routes
- `GET/POST /api/admin/tokens` — list / create Slashwork auth tokens
- `POST /api/admin/test-connection` — validate a Slashwork connection

### Utilities

- `src/retry.ts` — `fetchWithRetry(url, init, maxRetries)` with exponential backoff on 429/502/503/504
- `src/api-error.ts` — `apiError(message, code, status)` returns a typed `NextResponse` JSON error

### Config (`src/config.ts`)

`loadAppConfig()` loads `GITHUB_WEBHOOK_SECRET` and `SLASHWORK_GRAPHQL_URL`. Calendar and Scout configs are separate (`src/lib/config.ts` for Scout).

## Tests

Unit test files live next to source. E2e tests live in `tests/e2e/`. Pattern: `import { test, expect, describe } from "bun:test"`.

```sh
bun test                              # All tests
bun test --filter "handler"           # Match test file name
bun test src/calendar/calendar.test.ts  # Run single file
```

## Environment Variables

See `.env.example`. Key vars:
- `GITHUB_WEBHOOK_SECRET` — webhook signature verification
- `SLASHWORK_GRAPHQL_URL` — GraphQL endpoint
- `POSTGRESQL_ADDON_URI` — PostgreSQL connection string
- `ANTHROPIC_API_KEY` — for AI summaries and digests (uses `claude-haiku-4-5`)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk auth
- `GOOGLE_SERVICE_ACCOUNT_KEY` — calendar feature (optional)
- `PORT` — server port (default 3000)
- `SKIP_STREAMING_PORT` — Skip SSE port (default 8079)
- `SKIP_CONTROL_PORT` — Skip control/healthz port (default 8078)

Auth tokens for Slashwork groups are stored in the DB (`auth_tokens` table), not env vars.

## TypeScript

Strict mode with `noUncheckedIndexedAccess: true`. Target ESNext with bundler module resolution. Path alias: `@/*` → project root.

## Deployment

Clever Cloud via GitHub Actions (`.github/workflows/deploy.yml`). Push to `main` → build → typecheck → tests → force-push to Clever Cloud → auto-deploy. Migrations run automatically on each deploy via `instrumentation.ts`.

## CSS Patterns

Vanilla CSS with CSS variables (defined in `app/globals.css`). No component library. Each page has its own CSS file with a prefix: `sw-` (slashwork), `sum-` (summary), `dig-` (digest), `scout-` (scout), `nav-` (navigation).
