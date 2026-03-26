const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 1,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)) {
        return response;
      }

      // Retryable status code — clone the error info before retrying
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}
