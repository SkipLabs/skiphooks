import { test, expect, mock } from "bun:test";
import { fetchWithRetry } from "./retry";

test("fetchWithRetry: returns response on success", async () => {
  const mockFetch = mock(() =>
    Promise.resolve(new Response("ok", { status: 200 }))
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    const res = await fetchWithRetry("https://example.com", {});
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry: retries on 502", async () => {
  let callCount = 0;
  const mockFetch = mock(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.resolve(new Response("bad gateway", { status: 502 }));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    const res = await fetchWithRetry("https://example.com", {}, 1);
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry: does not retry on 400", async () => {
  let callCount = 0;
  const mockFetch = mock(() => {
    callCount++;
    return Promise.resolve(new Response("bad request", { status: 400 }));
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    const res = await fetchWithRetry("https://example.com", {}, 1);
    expect(res.status).toBe(400);
    expect(callCount).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry: cancels a retryable response body before retrying", async () => {
  const cancel = mock(() => Promise.resolve());
  let callCount = 0;
  const mockFetch = mock(() => {
    callCount++;
    if (callCount === 1) {
      // Minimal Response-like object exposing a cancellable body
      return Promise.resolve({
        ok: false,
        status: 503,
        body: { cancel },
      } as unknown as Response);
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    const res = await fetchWithRetry("https://example.com", {}, 1);
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry: does not cancel the final returned response", async () => {
  const cancel = mock(() => Promise.resolve());
  const mockFetch = mock(() =>
    Promise.resolve({ ok: false, status: 503, body: { cancel } } as unknown as Response)
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    // maxRetries 0 → single attempt, returns the 503 without cancelling its body
    const res = await fetchWithRetry("https://example.com", {}, 0);
    expect(res.status).toBe(503);
    expect(cancel).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchWithRetry: retries on network error", async () => {
  let callCount = 0;
  const mockFetch = mock(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.reject(new Error("network error"));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;

  try {
    const res = await fetchWithRetry("https://example.com", {}, 1);
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
