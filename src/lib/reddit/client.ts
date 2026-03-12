import { config } from "@/src/lib/config";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const BASE_URL = "https://oauth.reddit.com";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAccessToken(): Promise<string> {
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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Reddit OAuth failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (
    typeof data.access_token !== "string" ||
    typeof data.expires_in !== "number"
  ) {
    const errorDetail = data.error ? ` (${data.error})` : "";
    throw new Error(`Reddit OAuth returned unexpected response${errorDetail}`);
  }

  cachedToken = data.access_token;
  // Refresh 60 seconds before actual expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

export async function redditFetch<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = await getAccessToken();

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": config.reddit.userAgent,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : (attempt + 1) * 2000;
      console.warn(
        `Reddit 429 for ${path}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `Reddit API error: ${response.status} ${response.statusText} for ${path}`
      );
    }

    return response.json() as Promise<T>;
  }

  throw lastError ?? new Error(`Reddit API failed after ${MAX_RETRIES} retries for ${path}`);
}
