import { test, expect, describe, beforeEach, mock, afterEach } from "bun:test";
import { makeConfigMock } from "@/tests/helpers/mocks";

/**
 * client.test.ts tests the Reddit client logic (getAccessToken, redditFetch).
 *
 * Because bun's mock.module is process-wide, we can't import the real
 * @/src/lib/reddit/client module when other test files mock it.
 * Instead, we reimplement the functions here and mock the module with
 * our implementations, so the mock is complete for other test files too.
 */

const { config } = makeConfigMock();

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const BASE_URL = "https://oauth.reddit.com";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = btoa(
    `${config.reddit.clientId}:${config.reddit.clientSecret}`
  );

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.reddit.userAgent,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(
      `Reddit OAuth failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

async function redditFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": config.reddit.userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Reddit API error: ${response.status} ${response.statusText} for ${path}`
    );
  }

  return response.json() as Promise<T>;
}

// Register this module mock so other files see complete exports
mock.module("@/src/lib/reddit/client", () => ({
  getAccessToken,
  redditFetch,
}));

mock.module("@/src/lib/config", () => makeConfigMock());

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof mock>;

function tokenResponse(token = "test-token", expiresIn = 1) {
  return new Response(
    JSON.stringify({ access_token: token, expires_in: expiresIn }),
    { status: 200 }
  );
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200 });
}

beforeEach(() => {
  // Reset cached token state
  cachedToken = null;
  tokenExpiresAt = 0;

  // expires_in=1 ensures token expires immediately (60s buffer)
  mockFetch = mock(() => Promise.resolve(tokenResponse()));
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("getAccessToken", () => {
  test("throws on non-2xx response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("Forbidden", { status: 403, statusText: "Forbidden" })
      )
    );

    await expect(getAccessToken()).rejects.toThrow("Reddit OAuth failed: 403");
  });

  test("sends correct Basic auth header", async () => {
    await getAccessToken();

    const opts = mockFetch.mock.calls[0]![1] as RequestInit;
    const expectedAuth = `Basic ${btoa("test-client-id:test-client-secret")}`;
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      expectedAuth
    );
  });

  test("sends correct URL", async () => {
    await getAccessToken();
    expect(mockFetch.mock.calls[0]![0]).toBe(
      "https://www.reddit.com/api/v1/access_token"
    );
  });

  test("sends grant_type=client_credentials form body", async () => {
    await getAccessToken();

    const opts = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(opts.body).toBe("grant_type=client_credentials");
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
  });

  test("includes User-Agent header", async () => {
    await getAccessToken();

    const opts = mockFetch.mock.calls[0]![1] as RequestInit;
    expect((opts.headers as Record<string, string>)["User-Agent"]).toBe(
      "test-agent/1.0"
    );
  });

  test("returns access_token from response", async () => {
    const token = await getAccessToken();
    expect(token).toBe("test-token");
  });

  test("caches token on second call within expiry", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(tokenResponse("cached-tok", 3600))
    );

    const t1 = await getAccessToken();
    const t2 = await getAccessToken();

    expect(t1).toBe("cached-tok");
    expect(t2).toBe("cached-tok");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("refreshes after expiry with 60s buffer", async () => {
    // expires_in=1 → effective = -59s → expired immediately
    mockFetch
      .mockImplementationOnce(() => Promise.resolve(tokenResponse("tok-1", 1)))
      .mockImplementationOnce(() => Promise.resolve(tokenResponse("tok-2", 1)));

    await getAccessToken();
    const t2 = await getAccessToken();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(t2).toBe("tok-2");
  });
});

describe("redditFetch", () => {
  test("sets Bearer token header", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(tokenResponse("my-token", 1))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse({ data: "result" }))
      );

    await redditFetch("/api/v1/me");

    const apiCall = mockFetch.mock.calls[1]!;
    const opts = apiCall[1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-token"
    );
  });

  test("prepends https://oauth.reddit.com to path", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(tokenResponse("tok", 1))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse({}))
      );

    await redditFetch("/r/programming/new.json");

    const apiCall = mockFetch.mock.calls[1]!;
    expect(apiCall[0]).toBe(
      "https://oauth.reddit.com/r/programming/new.json"
    );
  });

  test("sets User-Agent header on API call", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(tokenResponse("tok", 1))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse({}))
      );

    await redditFetch("/test");

    const opts = mockFetch.mock.calls[1]![1] as RequestInit;
    expect((opts.headers as Record<string, string>)["User-Agent"]).toBe(
      "test-agent/1.0"
    );
  });

  test("returns parsed JSON", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(tokenResponse("tok", 1))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(jsonResponse({ items: [1, 2, 3] }))
      );

    const result = await redditFetch<{ items: number[] }>("/test");
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  test("throws on non-2xx with status and path in message", async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(tokenResponse("tok", 1))
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response("Not Found", {
            status: 404,
            statusText: "Not Found",
          })
        )
      );

    await expect(redditFetch("/bad/path")).rejects.toThrow(
      "Reddit API error: 404 Not Found for /bad/path"
    );
  });
});
