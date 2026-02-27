export type EventType = "pull_request" | "issues" | "push" | "release";

export interface RouteConfig {
  groupId: string;
}

export interface SkiphooksConfig {
  github: {
    webhookSecret: string;
  };
  slashwork: {
    graphqlUrl: string;
    authToken: string;
  };
  routes: Record<string, RouteConfig>;
}

export function loadConfig(): SkiphooksConfig {
  // Dynamic import of the user config at project root
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("../config.ts");
  const config: SkiphooksConfig = mod.default ?? mod;

  if (!config.github?.webhookSecret) {
    throw new Error("config: github.webhookSecret is required");
  }
  if (!config.slashwork?.graphqlUrl) {
    throw new Error("config: slashwork.graphqlUrl is required");
  }
  if (!config.slashwork?.authToken) {
    throw new Error("config: slashwork.authToken is required");
  }
  if (!config.routes || Object.keys(config.routes).length === 0) {
    throw new Error("config: at least one route must be configured");
  }

  for (const [name, route] of Object.entries(config.routes)) {
    if (!route?.groupId) {
      throw new Error(`config: routes.${name}.groupId is required`);
    }
  }

  return config;
}
