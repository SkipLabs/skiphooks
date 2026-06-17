import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { getAccessToken, _resetTokenCache } from "./auth";

// A real RSA key is required because getAccessToken signs a JWT (RS256).
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const keyJson = JSON.stringify({
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: privateKey,
  token_uri: "https://oauth2.googleapis.com/token",
});

function tokenResponse(accessToken: string, expiresIn = 3600): Response {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    { status: 200 },
  );
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  _resetTokenCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  _resetTokenCache();
});

describe("getAccessToken", () => {
  test("dedups concurrent refreshes into a single token exchange", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      return Promise.resolve(tokenResponse("tok-concurrent"));
    }) as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      getAccessToken(keyJson),
      getAccessToken(keyJson),
      getAccessToken(keyJson),
    ]);

    expect(a).toBe("tok-concurrent");
    expect(b).toBe("tok-concurrent");
    expect(c).toBe("tok-concurrent");
    expect(calls).toBe(1);
  });

  test("serves the cached token without re-fetching while valid", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      return Promise.resolve(tokenResponse("tok-cached"));
    }) as unknown as typeof fetch;

    expect(await getAccessToken(keyJson)).toBe("tok-cached");
    expect(await getAccessToken(keyJson)).toBe("tok-cached");
    expect(calls).toBe(1);
  });

  test("refreshes again after the in-flight promise has settled", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      // Near-expiry token so the 5-min buffer forces a refresh next call
      return Promise.resolve(tokenResponse(`tok-${calls}`, 60));
    }) as unknown as typeof fetch;

    expect(await getAccessToken(keyJson)).toBe("tok-1");
    expect(await getAccessToken(keyJson)).toBe("tok-2");
    expect(calls).toBe(2);
  });

  test("clears the in-flight promise on failure so a later call can retry", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(new Response("denied", { status: 403 }));
      }
      return Promise.resolve(tokenResponse("tok-recovered"));
    }) as unknown as typeof fetch;

    await expect(getAccessToken(keyJson)).rejects.toThrow("403");
    expect(await getAccessToken(keyJson)).toBe("tok-recovered");
    expect(calls).toBe(2);
  });
});
