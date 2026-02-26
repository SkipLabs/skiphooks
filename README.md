# Skiphooks

A GitHub PR webhook server that posts pull request events to Slashwork via their GraphQL API.

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

## Slashwork Configuration

1. Go to your Slashwork instance and create a **stream** (or use an existing one) where PR notifications will be posted.
2. Navigate to [slashwork.com/developer](https://slashwork.com/developer) and create an **application**.
3. Generate an **application token** — this goes in `SLASHWORK_APP_TOKEN`.
4. Find the **group ID** of your target stream — this goes in `SLASHWORK_GROUP_ID`.
5. Set `SLASHWORK_GRAPHQL_URL` to `https://<your-instance>.slashwork.com/graphql`.

## GitHub Webhook Setup

1. Go to your repo (or org) **Settings → Webhooks → Add webhook**.
2. **Payload URL:** `https://<your-server>/github-webhook`
3. **Content type:** `application/json`
4. **Secret:** Same value as your `GITHUB_WEBHOOK_SECRET` env var.
5. **Events:** Select "Pull requests" (under "Let me select individual events").

## Running

### Local development

```sh
bun run dev
```

### Production

```sh
bun run start
```

## Deployment

### Railway

Railway supports Bun natively. Push your repo, set the env vars in the dashboard, and set the start command to `bun src/index.ts`.

### Render

Create a new Web Service with Bun runtime and configure the env vars in the dashboard.

### Fly.io

```sh
fly launch
fly secrets set SLASHWORK_GRAPHQL_URL=... SLASHWORK_APP_TOKEN=... SLASHWORK_GROUP_ID=... GITHUB_WEBHOOK_SECRET=...
fly deploy
```

## Troubleshooting

- **Signature mismatch (401):** Ensure `GITHUB_WEBHOOK_SECRET` matches exactly between GitHub and your `.env`. Check for trailing whitespace.
- **Posts not appearing:** Verify `SLASHWORK_GROUP_ID` points to a valid stream. Check server logs for GraphQL errors.
- **Token issues:** Ensure `SLASHWORK_APP_TOKEN` has write permissions to the target group.
- **No events received:** Confirm the webhook is active in GitHub (Settings → Webhooks) and the "Pull requests" event is selected.
