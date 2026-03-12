import { test, expect, describe } from "bun:test";

const hasRedditCreds = !!process.env.REDDIT_CLIENT_ID;

describe.skipIf(!hasRedditCreds)("Reddit Client Integration (live)", () => {
  test("getAccessToken returns a token string", async () => {
    const { getAccessToken } = await import("@/src/lib/reddit/client");

    const token = await getAccessToken();

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  test("getAccessToken caches on repeat call", async () => {
    const { getAccessToken } = await import("@/src/lib/reddit/client");

    const token1 = await getAccessToken();
    const token2 = await getAccessToken();

    expect(token1).toBe(token2);
  });

  test("redditFetch /api/v1/me returns JSON", async () => {
    const { redditFetch } = await import("@/src/lib/reddit/client");

    const result = await redditFetch<{ name?: string }>("/api/v1/me");

    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });
});
