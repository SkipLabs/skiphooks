export type EventType = "pull_request" | "issues" | "issue_comment" | "push" | "release" | "workflow_run" | "deployment_status" | "pull_request_review" | "check_suite";

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

export interface AppConfig {
  github: {
    webhookSecret: string;
  };
  slashwork: {
    graphqlUrl: string;
  };
  calendar?: CalendarConfig;
}

export function loadAppConfig(): AppConfig {
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("config: GITHUB_WEBHOOK_SECRET is required");
  }

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  if (!graphqlUrl) {
    throw new Error("config: SLASHWORK_GRAPHQL_URL is required");
  }

  return {
    github: { webhookSecret },
    slashwork: { graphqlUrl },
  };
}

let cachedConfig: AppConfig | null = null;

/** Memoized accessor — loads and validates the config once per process. */
export function getAppConfig(): AppConfig {
  if (!cachedConfig) cachedConfig = loadAppConfig();
  return cachedConfig;
}

/** Reset the memoized config (for tests). */
export function _resetConfigCache(): void {
  cachedConfig = null;
}
