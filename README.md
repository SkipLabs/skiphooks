# Skiphooks

A GitHub webhook server that posts repository events to Slashwork via their GraphQL API. Supports pull requests, issues, pushes, and releases with config-driven routing to different Slashwork groups.

## Supported Events

| Event | Actions |
|---|---|
| `pull_request` | opened, closed/merged, review_requested, ready_for_review, synchronize |
| `issues` | opened, closed, reopened, labeled, assigned |
| `push` | all pushes (no action filter) |
| `release` | published, created, edited |

## Prerequisites

- [Bun](https://bun.sh) v1.0+

## Setup

1. Install dependencies:

```sh
bun install
```

2. Copy the environment template and fill in your values:

```sh
cp .env.example .env
```

3. Edit `.env` with your actual credentials (see sections below).

4. Edit `config.ts` to configure event routing (see [Configuration](#configuration)).

## Configuration

Event routing is configured in `config.ts` at the project root. Each event type maps to a Slashwork group ID:

```ts
import type { SkiphooksConfig } from "./src/config.ts";

const config: SkiphooksConfig = {
  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  slashwork: {
    graphqlUrl: process.env.SLASHWORK_GRAPHQL_URL!,
    authToken: process.env.SLASHWORK_AUTH_TOKEN!,
  },
  routes: {
    "my-project": { groupId: "group-abc-123" },
    "releases":   { groupId: "group-def-456" },
  },
};

export default config;
```

- **Secrets** stay in `.env` and are referenced via `process.env`.
- **Routes** are path-based — each route name becomes a `/github/<name>` endpoint. Only configured routes are active — requests to unknown routes return 404.

## Slashwork Configuration

See the [Slashwork Developer docs](https://slashwork.com/developer) for full details.

1. Create a **stream** (or use an existing one) where notifications will be posted.
2. Create an **application** with a dedicated auth token — this goes in `SLASHWORK_AUTH_TOKEN`.
3. Find the **group ID** of your target stream(s) from their URLs — these go in `config.ts` routes.
4. Set `SLASHWORK_GRAPHQL_URL` to `https://<your-instance>.slashwork.com/api/graphql`.

## GitHub Webhook Setup

1. Go to your repo (or org) **Settings → Webhooks → Add webhook**.
2. **Payload URL:** `https://<your-server>/github/<route-name>` (matching a route in `config.ts`)
3. **Content type:** `application/json`
4. **Secret:** Same value as your `GITHUB_WEBHOOK_SECRET` env var.
5. **Events:** Select the events you want (Pull requests, Issues, Pushes, Releases).

## Running

### Local development

```sh
bun run dev
```

### Production

```sh
bun run start
```

## Testing

```sh
bun test
```

## Deployment

Deployed to [Clever Cloud](https://clever-cloud.com) via GitHub Actions. Every push to `main` runs typecheck and tests, then deploys automatically on success.

**Required GitHub secrets** (Settings > Secrets and variables > Actions):
- `CLEVER_TOKEN`
- `CLEVER_SECRET`

## Troubleshooting

- **Signature mismatch (401):** Ensure `GITHUB_WEBHOOK_SECRET` matches exactly between GitHub and your `.env`. Check for trailing whitespace.
- **Posts not appearing:** Verify group IDs in `config.ts` point to valid streams. Check server logs for GraphQL errors.
- **Token issues:** Ensure `SLASHWORK_AUTH_TOKEN` has write permissions to the target groups.
- **No events received:** Confirm the webhook is active in GitHub (Settings → Webhooks) and the desired events are selected.
- **Event ignored:** Check that the route exists in `config.ts` and the action is one of the supported actions listed above.
