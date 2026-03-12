import { test, expect, describe, beforeEach, mock } from "bun:test";
import { makeQueueItem, makeThread } from "@/tests/helpers/factories";
import { makeRepositoryMocks } from "@/tests/helpers/mocks";

// Mock dependencies
const mockAuth = mock(() => Promise.resolve({ userId: "user-123" as string | null }));
const repoMocks = makeRepositoryMocks();
const mockGetQueue = repoMocks.getQueue;

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

mock.module("@/src/lib/db/repository", () => repoMocks);

const { GET } = await import("@/src/app/api/queue/route");

beforeEach(() => {
  mockAuth.mockReset();
  mockGetQueue.mockReset();

  mockAuth.mockResolvedValue({ userId: "user-123" });
  mockGetQueue.mockResolvedValue([]);
});

describe("GET /api/queue", () => {
  test("returns 401 when not authed", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const request = new Request("http://localhost/api/queue");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("passes status query param as filter", async () => {
    const request = new Request("http://localhost/api/queue?status=pending");
    await GET(request);

    expect(mockGetQueue).toHaveBeenCalledWith({ status: "pending" });
  });

  test("passes urgency query param as filter", async () => {
    const request = new Request("http://localhost/api/queue?urgency=high");
    await GET(request);

    expect(mockGetQueue).toHaveBeenCalledWith({ urgency: "high" });
  });

  test("passes subreddit query param as filter", async () => {
    const request = new Request(
      "http://localhost/api/queue?subreddit=programming"
    );
    await GET(request);

    expect(mockGetQueue).toHaveBeenCalledWith({ subreddit: "programming" });
  });

  test("passes minScore as parsed float", async () => {
    const request = new Request("http://localhost/api/queue?minScore=0.75");
    await GET(request);

    expect(mockGetQueue).toHaveBeenCalledWith({ minScore: 0.75 });
  });

  test("combines multiple filters", async () => {
    const request = new Request(
      "http://localhost/api/queue?status=pending&urgency=high&subreddit=webdev&minScore=0.8"
    );
    await GET(request);

    expect(mockGetQueue).toHaveBeenCalledWith({
      status: "pending",
      urgency: "high",
      subreddit: "webdev",
      minScore: 0.8,
    });
  });

  test("returns 400 for invalid minScore", async () => {
    const request = new Request("http://localhost/api/queue?minScore=notanumber");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid minScore value");
    expect(mockGetQueue).not.toHaveBeenCalled();
  });

  test("returns results as JSON", async () => {
    const items = [
      {
        ...makeQueueItem(),
        thread: makeThread(),
      },
    ];
    mockGetQueue.mockResolvedValue(items);

    const request = new Request("http://localhost/api/queue");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
  });

  test("returns empty array when no items", async () => {
    const request = new Request("http://localhost/api/queue");
    const response = await GET(request);

    const body = await response.json();
    expect(body).toEqual([]);
  });

  test("calls getQueue with empty filter when no params", async () => {
    const request = new Request("http://localhost/api/queue");
    await GET(request);

    expect(mockGetQueue).toHaveBeenCalledWith({});
  });
});
