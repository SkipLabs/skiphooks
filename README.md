# Skiphooks

A Next.js app that connects GitHub and Google Calendar to [Slashwork](https://slashwork.com):

- **GitHub webhooks** → formatted posts in Slashwork groups, with DB-configured routing.
- **AI weekly summaries** per group and a **cross-group digest** (Anthropic Claude).
- **Group discovery** that syncs all Slashwork groups into the local database.
- **Calendar reminders** polled from Google Calendar.
- A **real-time admin page** (`/slashwork`) streamed from PostgreSQL via Skip Runtime.

## Supported Events

| Event | Actions |
|---|---|
| `pull_request` | opened, closed/merged, review_requested, ready_for_review, synchronize |
| `pull_request_review` | submitted |
| `issues` | opened, closed, reopened, labeled, assigned |
| `issue_comment` | created |
| `push` | all pushes |
| `release` | published, created, edited |
| `check_suite` | completed |
| `workflow_run` | completed |
| `deployment_status` | all (no action field) |

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- PostgreSQL (Clever Cloud provides `POSTGRESQL_ADDON_URI`)
- A [Clerk](https://clerk.com) application for sign-in
- An Anthropic API key for summaries and digests (optional)

## Setup

1. Install dependencies:

   ```sh
   bun install
   ```

2. Copy the environment template and fill in your values:

   ```sh
   cp .env.example .env
   ```

3. Run the migrations (they also run automatically on app start):

   ```sh
   bun run db:migrate
   ```

4. Configure Slashwork tokens, groups and routes (see below), then start the app:

   ```sh
   bun run dev
   ```

## Configuration

Routing lives in the database, not in a config file. Three tables drive it:

| Table | Purpose |
|---|---|
| `auth_tokens` | Named Slashwork application tokens (`name`, `token`) |
| `groups` | Named Slashwork groups: `slashwork_id` plus the `auth_token` name to post with |
| `routes` | Webhook endpoints. Each route name becomes `POST /github/<name>` and points either at a group **or** at a `stream_id` + `auth_token` pair |

Manage them from the `/slashwork` admin page or with the admin API (Clerk session required):

```sh
# Add a token
curl -X POST https://<host>/api/admin/tokens \
  -H 'content-type: application/json' \
  -d '{"name":"myproject","token":"<slashwork token>"}'

# Group-based route (uses the group's id and token)
curl -X POST https://<host>/api/admin/routes \
  -H 'content-type: application/json' \
  -d '{"name":"myproject","groupName":"myproject"}'

# Stream-based route (explicit stream id and token name)
curl -X POST https://<host>/api/admin/routes \
  -H 'content-type: application/json' \
  -d '{"name":"releases","streamId":"g_def456","authToken":"myproject"}'
```

Requests to routes that do not exist return 404. `bun run db:seed` seeds the Skip Labs tokens, groups and routes from the `SLASHWORK_AUTH_TOKEN_*` variables in `.env`.

## Slashwork Configuration

See the [Slashwork Developer docs](https://slashwork.com/developer).

1. Create a **stream** (or use an existing one) where notifications will be posted.
2. Create an **application** with a dedicated auth token and store it in `auth_tokens`.
3. Find the **group ID** of your target stream(s) from their URLs and store it in `groups` or as a route's `streamId`.
4. Set `SLASHWORK_GRAPHQL_URL` to `https://<your-instance>.slashwork.com/api/graphql`.

## GitHub Webhook Setup

1. Go to your repo (or org) **Settings → Webhooks → Add webhook**.
2. **Payload URL:** `https://<your-server>/github/<route-name>`
3. **Content type:** `application/json`
4. **Secret:** the value of `GITHUB_WEBHOOK_SECRET`.
5. **Events:** select the events you want from the table above.

## Summaries and Digest

- `/summary` — pick a group and a week, generate an AI summary, publish it to the group.
- `/digest` — configure and trigger the cross-group weekly digest. When auto-post is on, it is published every Thursday at 14:00 UTC.
- `./summarize-group.sh <group> <week>` — CLI wrapper around `POST /api/summary`.

## Running

```sh
bun run dev     # development server
bun run build   # production build
bun run start   # production server
```

## Testing

```sh
bun run test                            # all test files, one Bun process each
bun test src/calendar/calendar.test.ts  # single file
bun run typecheck
```

Test files run in separate processes because Bun's `mock.module` is process-wide.

## Deployment

Deployed to [Clever Cloud](https://clever-cloud.com) via GitHub Actions. Every push to `main` runs migrations against a throwaway Postgres, builds, typechecks and tests, then force-pushes to Clever Cloud.

**Required GitHub secrets** (Settings → Secrets and variables → Actions):
- `CLEVER_TOKEN`
- `CLEVER_SECRET`
- `CLEVER_GIT_URL`

## Troubleshooting

- **Signature mismatch (401):** `GITHUB_WEBHOOK_SECRET` must match GitHub exactly. Check for trailing whitespace.
- **Route not found (404):** the route name in the payload URL must exist in the `routes` table.
- **Posts not appearing:** verify the group's `slashwork_id` or the route's `stream_id`, and check server logs for GraphQL errors.
- **Token issues:** the token stored in `auth_tokens` needs write access to the target group. `POST /api/admin/test-connection` validates a token.
- **Event ignored:** the event and action must be in the table above; anything else is logged and dropped.
- **Admin page not updating live:** check the Skip health endpoints on `SKIP_CONTROL_PORT` and `SKIP_STREAMING_PORT`; the watchdog restarts the process after five consecutive failures.
