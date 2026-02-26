import type { SkiphooksConfig } from "./src/config.ts";

const config: SkiphooksConfig = {
  github: {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
  slashwork: {
    graphqlUrl: process.env.SLASHWORK_GRAPHQL_URL!,
    accessToken: process.env.SLASHWORK_ACCESS_TOKEN!,
  },
  routes: {
    pull_request: { groupId: "group-abc-123" },
    issues: { groupId: "group-abc-123" },
    push: { groupId: "group-abc-123" },
    release: { groupId: "group-abc-123" },
  },
};

export default config;
