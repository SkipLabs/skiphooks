export type EventType = "pull_request" | "issues" | "issue_comment" | "push" | "release";

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

  const config: AppConfig = {
    github: { webhookSecret },
    slashwork: { graphqlUrl },
  };

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const authToken = process.env.SLASHWORK_AUTH_TOKEN_GOOGLE_CALENDAR;
    if (!authToken) {
      throw new Error("config: SLASHWORK_AUTH_TOKEN_GOOGLE_CALENDAR is required when GOOGLE_SERVICE_ACCOUNT_KEY is set");
    }

    config.calendar = {
      serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      authToken,
      users: [
        { name: "Hugo", calendarId: "hugo@skiplabs.io", targetId: "g_cR_HOoSUCphBLt7gktCEyi" },
      ],
    };
  }

  return config;
}
