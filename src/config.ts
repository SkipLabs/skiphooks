export type EventType = "pull_request" | "issues" | "issue_comment" | "push" | "release";

export interface StreamRouteConfig {
  streamId: string;
  authToken: string;
}

export interface GroupRouteConfig {
  group: string;
}

export type RouteConfig = StreamRouteConfig | GroupRouteConfig;

export interface GroupConfig {
  id: string;
  authToken: string;
}

export interface SkiphooksConfig {
  github: {
    webhookSecret: string;
  };
  slashwork: {
    graphqlUrl: string;
  };
  groups?: Record<string, GroupConfig>;
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
  if (!config.routes || Object.keys(config.routes).length === 0) {
    throw new Error("config: at least one route must be configured");
  }

  if (config.groups) {
    for (const [name, group] of Object.entries(config.groups)) {
      if (!group?.id) {
        throw new Error(`config: groups.${name}.id is required`);
      }
      if (!group?.authToken) {
        throw new Error(`config: groups.${name}.authToken is required`);
      }
    }
  }

  for (const [name, route] of Object.entries(config.routes)) {
    if ("group" in route) {
      if (!config.groups?.[route.group]) {
        throw new Error(`config: routes.${name}.group references unknown group "${route.group}"`);
      }
    } else {
      if (!route?.streamId) {
        throw new Error(`config: routes.${name}.streamId is required`);
      }
      if (!route?.authToken) {
        throw new Error(`config: routes.${name}.authToken is required`);
      }
    }
  }

  return config;
}
