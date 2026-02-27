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
    "skipper": { groupId: "g_dUYLNrxW7GzSxQwCKfGGQL" },
  },
};

export default config;
