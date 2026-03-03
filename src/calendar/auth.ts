import { createSign } from "node:crypto";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function createJwt(key: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
  ];
  const signingInput = segments.join(".");

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(key.private_key);

  return `${signingInput}.${base64url(signature)}`;
}

export function parseServiceAccountKey(
  jsonString: string,
): ServiceAccountKey {
  const content = JSON.parse(jsonString);
  if (!content.client_email || !content.private_key) {
    throw new Error(
      "Service account key missing client_email or private_key",
    );
  }
  return {
    client_email: content.client_email,
    private_key: content.private_key,
    token_uri: content.token_uri || "https://oauth2.googleapis.com/token",
  };
}

export async function getAccessToken(serviceAccountKey: string): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.accessToken;
  }

  const key = parseServiceAccountKey(serviceAccountKey);
  const jwt = createJwt(key);

  const response = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Google OAuth token exchange failed: ${response.status} - ${body}`,
    );
  }

  const result = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: result.access_token,
    expiresAt: Date.now() + result.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

export async function validateCalendarAuth(
  serviceAccountKey: string,
): Promise<void> {
  await getAccessToken(serviceAccountKey);
}

/** Reset cached token (for tests). */
export function _resetTokenCache(): void {
  cachedToken = null;
}
