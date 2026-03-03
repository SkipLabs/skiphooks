import type { SkiphooksConfig } from "./src/config.ts";

const config: SkiphooksConfig = {
  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  slashwork: {
    graphqlUrl: process.env.SLASHWORK_GRAPHQL_URL!,
  },
  groups: {
    skipper: {
      id: "g_aVypv5BKvHiKP3tikjHjtj",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKIPPER!,
    },
    skjs: {
      id: "g_d_Px84GPeIF977BNqP0fGn",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKJS!,
    },
  },
  ...(process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? {
        calendar: {
          serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
          authToken: process.env.SLASHWORK_AUTH_TOKEN_GOOGLE_CALENDAR!,
          users: [
            // Add one entry per user: their calendar → a Slashwork group or chat
            // { name: "Alice", calendarId: "alice@example.com", targetId: "g_..." },
          ],
        },
      }
    : {}),
  routes: {
    skipper: {
      group: "skipper",
    },
    skjs: {
      group: "skjs",
    },
    skipper_stream: {
      streamId: "g_dUYLNrxW7GzSxQwCKfGGQL",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKIPPER!,
    },
    skjs_stream: {
      streamId: "g_ekf0qeZiciWhPKidOUJNzt",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKJS!,
    },
  },
};

export default config;
