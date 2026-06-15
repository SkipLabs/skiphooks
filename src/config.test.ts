import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { loadAppConfig } from "./config";

beforeEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.SLASHWORK_GRAPHQL_URL;
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.SLASHWORK_GRAPHQL_URL;
});

describe("loadAppConfig", () => {
  test("throws when GITHUB_WEBHOOK_SECRET is missing", () => {
    process.env.SLASHWORK_GRAPHQL_URL = "https://example.com/graphql";
    expect(() => loadAppConfig()).toThrow("GITHUB_WEBHOOK_SECRET");
  });

  test("throws when SLASHWORK_GRAPHQL_URL is missing", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "secret";
    expect(() => loadAppConfig()).toThrow("SLASHWORK_GRAPHQL_URL");
  });

  test("returns correct config when both vars are set", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "my-secret";
    process.env.SLASHWORK_GRAPHQL_URL = "https://example.com/graphql";
    const config = loadAppConfig();
    expect(config.github.webhookSecret).toBe("my-secret");
    expect(config.slashwork.graphqlUrl).toBe("https://example.com/graphql");
  });
});
