import { test, expect, mock, describe, beforeEach, afterEach } from "bun:test";
import { validateConnection, postToSlashwork } from "./slashwork";

const connection = {
  graphqlUrl: "https://slashwork.example.com/graphql",
  authToken: "test-token",
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("validateConnection", () => {
  test("resolves on 200 with no GraphQL errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ data: { viewer: { __typename: "Viewer" } } }), { status: 200 }))
    ) as unknown as typeof fetch;
    await expect(validateConnection(connection)).resolves.toBeUndefined();
  });

  test("throws on non-200 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }))
    ) as unknown as typeof fetch;
    await expect(validateConnection(connection)).rejects.toThrow("401");
  });

  test("throws on GraphQL errors in response body", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ errors: [{ message: "not authenticated" }] }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
    await expect(validateConnection(connection)).rejects.toThrow("not authenticated");
  });

  test("sends Authorization header with Bearer token", async () => {
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((_url, init) => {
      capturedHeaders = new Headers((init as RequestInit).headers as HeadersInit);
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }) as unknown as typeof fetch;
    await validateConnection(connection);
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer test-token");
  });
});

describe("postToSlashwork", () => {
  test("resolves on success", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ data: { createPost: { node: { id: "post-123" } } } }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
    await expect(postToSlashwork(connection, "group-1", "Hello markdown")).resolves.toBeUndefined();
  });

  test("sends groupId and markdown in mutation variables", async () => {
    let capturedBody: { variables?: { groupId?: string; markdown?: string } } = {};
    globalThis.fetch = mock((_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as typeof capturedBody;
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    }) as unknown as typeof fetch;
    await postToSlashwork(connection, "group-abc", "## Weekly update");
    expect(capturedBody.variables?.groupId).toBe("group-abc");
    expect(capturedBody.variables?.markdown).toBe("## Weekly update");
  });

  test("throws on non-200 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" }))
    ) as unknown as typeof fetch;
    await expect(postToSlashwork(connection, "group-1", "test")).rejects.toThrow("500");
  });

  test("throws on GraphQL errors in response body", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ errors: [{ message: "group not found" }] }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
    await expect(postToSlashwork(connection, "group-1", "test")).rejects.toThrow("group not found");
  });
});
