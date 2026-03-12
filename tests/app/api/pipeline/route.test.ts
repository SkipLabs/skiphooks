import { test, expect, describe, beforeEach, mock } from "bun:test";

// Mock dependencies
const mockAuth = mock(() => Promise.resolve({ userId: "user-123" as string | null }));
const mockRunPipeline = mock(() =>
  Promise.resolve({
    threadsScanned: 10,
    threadsSaved: 2,
    commentsSaved: 5,
    durationMs: 1500,
  })
);

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

mock.module("@/src/lib/pipeline/runner", () => ({
  runPipeline: mockRunPipeline,
}));

const { POST } = await import("@/src/app/api/pipeline/route");

beforeEach(() => {
  mockAuth.mockReset();
  mockRunPipeline.mockReset();

  mockAuth.mockResolvedValue({ userId: "user-123" });
  mockRunPipeline.mockResolvedValue({
    threadsScanned: 10,
    threadsSaved: 2,
    commentsSaved: 5,
    durationMs: 1500,
  });
});

describe("POST /api/pipeline", () => {
  test("returns 401 when no userId", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const request = new Request("http://localhost/api/pipeline", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("passes body options to runPipeline", async () => {
    const request = new Request("http://localhost/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subreddits: ["typescript", "rust"],
        maxPosts: 50,
        dryRun: true,
      }),
    });

    await POST(request);

    expect(mockRunPipeline).toHaveBeenCalledWith({
      subreddits: ["typescript", "rust"],
      maxPosts: 50,
      dryRun: true,
    });
  });

  test("returns RunResult as JSON", async () => {
    const request = new Request("http://localhost/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      threadsScanned: 10,
      threadsSaved: 2,
      commentsSaved: 5,
      durationMs: 1500,
    });
  });

  test("handles empty/missing body gracefully", async () => {
    const request = new Request("http://localhost/api/pipeline", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    // runPipeline called with undefined options (no body parsed)
    expect(mockRunPipeline).toHaveBeenCalledWith(undefined);
  });

  test("handles runPipeline error", async () => {
    mockRunPipeline.mockRejectedValue(new Error("Pipeline exploded"));

    const request = new Request("http://localhost/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Pipeline exploded");
  });
});
