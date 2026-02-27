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
      id: "https://skiplabs.slashwork.com/stream/g_dUYLNrxW7GzSxQwCKfGGQL",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKIPPER!,
    },
  },
  routes: {
    skipper: {
      group: "skipper",
    },
    skipper_stream: {
      streamId: "g_dUYLNrxW7GzSxQwCKfGGQL",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKIPPER!,
    },
    skjs_stream: {
      streamId: "g_dUYLNrxW7GzSxQwCKfGGQL",
      authToken: process.env.SLASHWORK_AUTH_TOKEN_SKJS!,
    },
  },
};

export default config;
