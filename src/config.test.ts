import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { loadAppConfig, getAppConfig, _resetConfigCache } from "./config";

beforeEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.SLASHWORK_GRAPHQL_URL;
  _resetConfigCache();
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.SLASHWORK_GRAPHQL_URL;
  _resetConfigCache();
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

describe("getAppConfig", () => {
  test("memoizes and returns the same instance across calls", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "memo-secret";
    process.env.SLASHWORK_GRAPHQL_URL = "https://memo.example.com/graphql";
    const first = getAppConfig();
    const second = getAppConfig();
    expect(second).toBe(first);
    expect(first.github.webhookSecret).toBe("memo-secret");
  });

  test("does not re-read env after the first successful load", () => {
    process.env.GITHUB_WEBHOOK_SECRET = "initial";
    process.env.SLASHWORK_GRAPHQL_URL = "https://memo.example.com/graphql";
    const first = getAppConfig();
    // Mutate env; memoized accessor must keep returning the cached value
    process.env.GITHUB_WEBHOOK_SECRET = "changed";
    expect(getAppConfig().github.webhookSecret).toBe("initial");
    expect(getAppConfig()).toBe(first);
  });

  test("propagates the validation error when config is missing", () => {
    expect(() => getAppConfig()).toThrow("GITHUB_WEBHOOK_SECRET");
  });
});
