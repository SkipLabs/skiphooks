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

export interface CalendarUserConfig {
  name: string;
  calendarId: string;
  targetId: string;
}

export interface CalendarConfig {
  serviceAccountKey: string;
  authToken: string;
  users: CalendarUserConfig[];
  pollIntervalMs?: number;
  reminderLeadTimeMs?: number;
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
  calendar?: CalendarConfig;
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

  if (config.calendar) {
    const cal = config.calendar;
    if (!cal.serviceAccountKey) {
      throw new Error("config: calendar.serviceAccountKey is required");
    }
    if (!cal.authToken) {
      throw new Error("config: calendar.authToken is required");
    }
    if (!cal.users || cal.users.length === 0) {
      throw new Error("config: calendar.users must have at least one entry");
    }
    for (const user of cal.users) {
      if (!user.name) {
        throw new Error("config: each calendar user must have a name");
      }
      if (!user.calendarId) {
        throw new Error(`config: calendar user "${user.name}" must have a calendarId`);
      }
      if (!user.targetId) {
        throw new Error(`config: calendar user "${user.name}" must have a targetId`);
      }
    }
  }

  return config;
}
