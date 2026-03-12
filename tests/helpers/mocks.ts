/**
 * Shared no-op mock stubs for modules that are mocked by multiple test files.
 * Bun's mock.module is process-wide, so every mock of a module must include
 * ALL exports to avoid "export not found" errors when files run together.
 */
import { mock } from "bun:test";

/** All exports from @/src/lib/db/repository as no-op mocks */
export function makeRepositoryMocks() {
  return {
    saveThread: mock(() => Promise.resolve({})),
    threadExists: mock(() => Promise.resolve(false)),
    saveQueueItem: mock(() => Promise.resolve({})),
    saveThreadWithComments: mock(() => Promise.resolve({ thread: {}, comments: [] })),
    commentExists: mock(() => Promise.resolve(false)),
    getQueue: mock((_filter?: Record<string, unknown>) => Promise.resolve([] as unknown[])),
    updateQueueItem: mock(() => Promise.resolve({})),
    createCrawlRun: mock(() => Promise.resolve({})),
    completeCrawlRun: mock(() => Promise.resolve({})),
  };
}

/** All exports from @/src/lib/reddit/client as no-op mocks */
export function makeRedditClientMocks() {
  return {
    getAccessToken: mock(() => Promise.resolve("mock-token")),
    redditFetch: mock(() => Promise.resolve({})),
  };
}

/** Standard config mock matching the shape of @/src/lib/config */
export function makeConfigMock() {
  return {
    config: {
      reddit: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        userAgent: "test-agent/1.0",
        rateLimitMs: 0,
      },
      anthropic: { apiKey: "x", model: "test" },
      scoring: {
        topicDescription: "test",
        replyPersona: "test",
        threadThreshold: 0.5,
        commentThreshold: 0.6,
      },
      db: { url: "postgres://test" },
      pipeline: {
        subreddits: ["programming"],
        batchSize: 20,
        maxCommentsPerThread: 100,
        pollIntervalMs: 60000,
      },
    },
  };
}
