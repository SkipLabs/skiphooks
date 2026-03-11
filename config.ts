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
    skip: {
      id: "g_cQCWnkXg9OvL08OvMC6XKZ",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKIP!,
    },
  },
  ...(process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? {
        calendar: {
          serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
          authToken: process.env.SLASHWORK_AUTH_TOKEN_GOOGLE_CALENDAR!,
          users: [
            { name: "Hugo", calendarId: "hugo@skiplabs.io", targetId: "g_cR_HOoSUCphBLt7gktCEyi" },
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
    skip: {
      group: "skip",
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
