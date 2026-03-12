import type { ScoringConfig } from "@/src/types/scoring";
import type { ScoutConfigRow } from "@/src/types/storage";

type Config = {
  reddit: {
    clientId: string;
    clientSecret: string;
    userAgent: string;
    rateLimitMs: number;
  };
  anthropic: {
    apiKey: string;
    model: string;
  };
  scoring: ScoringConfig;
  db: {
    url: string;
  };
  pipeline: {
    subreddits: string[];
    batchSize: number;
    maxCommentsPerThread: number;
    pollIntervalMs: number;
  };
};

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function safeParseInt(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (isNaN(n)) throw new Error(`Invalid integer for ${name}: "${value}"`);
  return n;
}

function safeParseFloat(value: string, name: string): number {
  const n = parseFloat(value);
  if (isNaN(n)) throw new Error(`Invalid number for ${name}: "${value}"`);
  return n;
}

function buildConfig(): Config {
  const errors: string[] = [];

  function collectEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      errors.push(`Missing required environment variable: ${name}`);
      return "";
    }
    return value;
  }

  const redditClientId = collectEnv("REDDIT_CLIENT_ID");
  const redditClientSecret = collectEnv("REDDIT_CLIENT_SECRET");
  const redditUserAgent = optionalEnv(
    "REDDIT_USER_AGENT",
    "reddit-scout/1.0 by u/yourusername"
  );
  const anthropicApiKey = collectEnv("ANTHROPIC_API_KEY");
  const databaseUrl = collectEnv("POSTGRESQL_ADDON_URI");

  if (errors.length > 0) {
    throw new Error(
      `Environment variable validation failed:\n  ${errors.join("\n  ")}`
    );
  }

  const scoring: ScoringConfig = {
    topicDescription: "",
    replyPersona: "",
    threadThreshold: safeParseFloat(
      optionalEnv("SCOUT_THREAD_THRESHOLD", "0.5"),
      "SCOUT_THREAD_THRESHOLD"
    ),
    commentThreshold: safeParseFloat(
      optionalEnv("SCOUT_COMMENT_THRESHOLD", "0.6"),
      "SCOUT_COMMENT_THRESHOLD"
    ),
  };

  return Object.freeze({
    reddit: Object.freeze({
      clientId: redditClientId,
      clientSecret: redditClientSecret,
      userAgent: redditUserAgent,
      rateLimitMs: safeParseInt(
        optionalEnv("SCOUT_RATE_LIMIT_MS", "1000"),
        "SCOUT_RATE_LIMIT_MS"
      ),
    }),
    anthropic: Object.freeze({
      apiKey: anthropicApiKey,
      model: optionalEnv("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
    }),
    scoring: Object.freeze(scoring),
    db: Object.freeze({
      url: databaseUrl,
    }),
    pipeline: Object.freeze({
      subreddits: [],
      batchSize: safeParseInt(
        optionalEnv("SCOUT_BATCH_SIZE", "20"),
        "SCOUT_BATCH_SIZE"
      ),
      maxCommentsPerThread: safeParseInt(
        optionalEnv("SCOUT_MAX_COMMENTS_PER_THREAD", "100"),
        "SCOUT_MAX_COMMENTS_PER_THREAD"
      ),
      pollIntervalMs: safeParseInt(
        optionalEnv("SCOUT_POLL_INTERVAL_MS", "60000"),
        "SCOUT_POLL_INTERVAL_MS"
      ),
    }),
  });
}

const REQUIRED_SCOUT_VARS = [
  "REDDIT_CLIENT_ID",
  "REDDIT_CLIENT_SECRET",
  "ANTHROPIC_API_KEY",
  "POSTGRESQL_ADDON_URI",
] as const;

export type ScoutWarning = { variable: string; label: string };

const VAR_LABELS: Record<string, string> = {
  REDDIT_CLIENT_ID: "Reddit OAuth client ID",
  REDDIT_CLIENT_SECRET: "Reddit OAuth client secret",
  ANTHROPIC_API_KEY: "Anthropic API key (for scoring)",
  POSTGRESQL_ADDON_URI: "PostgreSQL connection string",
};

export function getScoutWarnings(): ScoutWarning[] {
  return REQUIRED_SCOUT_VARS.filter((v) => !process.env[v]).map((v) => ({
    variable: v,
    label: VAR_LABELS[v] ?? v,
  }));
}

export function hasDatabase(): boolean {
  return !!process.env.POSTGRESQL_ADDON_URI;
}

export interface PipelineConfig {
  subreddits: string[];
  topicDescription: string;
  replyPersona: string;
  threadThreshold: number;
  commentThreshold: number;
  rateLimitMs: number;
  pollIntervalMs: number;
}

export async function loadPipelineConfig(): Promise<PipelineConfig> {
  // Try DB first
  if (hasDatabase()) {
    try {
      const { getScoutConfig } = await import("@/src/lib/db/repository");
      const dbConfig: ScoutConfigRow | null = await getScoutConfig();
      if (dbConfig) {
        return {
          subreddits: dbConfig.subreddits,
          topicDescription: dbConfig.topicDescription,
          replyPersona: dbConfig.replyPersona,
          threadThreshold: dbConfig.threadThreshold,
          commentThreshold: dbConfig.commentThreshold,
          rateLimitMs: dbConfig.rateLimitMs,
          pollIntervalMs: dbConfig.pollIntervalMs,
        };
      }
    } catch {
      // Fall through to env vars
    }
  }

  // Fall back to env vars
  return {
    subreddits: [],
    topicDescription: "",
    replyPersona: "",
    threadThreshold: parseFloat(process.env.SCOUT_THREAD_THRESHOLD ?? "0.5"),
    commentThreshold: parseFloat(process.env.SCOUT_COMMENT_THRESHOLD ?? "0.6"),
    rateLimitMs: parseInt(process.env.SCOUT_RATE_LIMIT_MS ?? "1000", 10),
    pollIntervalMs: parseInt(process.env.SCOUT_POLL_INTERVAL_MS ?? "60000", 10),
  };
}

let _config: Config | null = null;

export const config: Config = new Proxy({} as Config, {
  get(_target, prop, receiver) {
    if (!_config) {
      _config = buildConfig();
    }
    return Reflect.get(_config, prop, receiver);
  },
});
