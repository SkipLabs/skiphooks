import { test, expect, describe, beforeEach, mock } from "bun:test";
import { makeQueueItem } from "@/tests/helpers/factories";
import { makeRepositoryMocks } from "@/tests/helpers/mocks";

// Mock dependencies
const mockAuth = mock(() => Promise.resolve({ userId: "user-123" as string | null }));
const repoMocks = makeRepositoryMocks();
const mockUpdateQueueItem = repoMocks.updateQueueItem;

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

mock.module("@/src/lib/db/repository", () => repoMocks);

const { PATCH } = await import("@/src/app/api/queue/[id]/route");

function makePatchRequest(id: string, body: Record<string, unknown>) {
  const request = new Request(`http://localhost/api/queue/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const params = Promise.resolve({ id });
  return { request, params };
}

beforeEach(() => {
  mockAuth.mockReset();
  mockUpdateQueueItem.mockReset();

  mockAuth.mockResolvedValue({ userId: "user-123" });
  mockUpdateQueueItem.mockResolvedValue(makeQueueItem());
});

describe("PATCH /api/queue/[id]", () => {
  test("returns 401 when not authed", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { request, params } = makePatchRequest("qi-1", {
      status: "replied",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 400 for invalid status", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      status: "invalid_status",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid status");
    expect(body.error).toContain("invalid_status");
  });

  test("accepts status 'pending'", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      status: "pending",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { status: "pending" });
  });

  test("accepts status 'replied'", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      status: "replied",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { status: "replied" });
  });

  test("accepts status 'dismissed'", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      status: "dismissed",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { status: "dismissed" });
  });

  test("accepts status 'snoozed'", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      status: "snoozed",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { status: "snoozed" });
  });

  test("updates notes", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      notes: "Follow up next week",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { notes: "Follow up next week" });
  });

  test("returns 400 when neither status nor notes provided", async () => {
    const { request, params } = makePatchRequest("qi-1", {});
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("No valid fields provided");
  });

  test("passes route param id correctly", async () => {
    const { request, params } = makePatchRequest("specific-uuid-123", {
      status: "replied",
    });
    await PATCH(request, { params });

    expect(mockUpdateQueueItem).toHaveBeenCalledWith(
      "specific-uuid-123",
      { status: "replied" }
    );
  });

  test("handles both status + notes together", async () => {
    const { request, params } = makePatchRequest("qi-1", {
      status: "replied",
      notes: "Replied on Reddit",
    });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { status: "replied", notes: "Replied on Reddit" });
  });

  test("returns updated queue item as JSON", async () => {
    const updatedItem = makeQueueItem({
      id: "qi-1",
      status: "dismissed",
    });
    mockUpdateQueueItem.mockResolvedValue(updatedItem);

    const { request, params } = makePatchRequest("qi-1", {
      status: "dismissed",
    });
    const response = await PATCH(request, { params });

    const body = await response.json();
    expect(body.id).toBe("qi-1");
    expect(body.status).toBe("dismissed");
  });

  test("empty string notes is valid (typeof string check)", async () => {
    const { request, params } = makePatchRequest("qi-1", { notes: "" });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(mockUpdateQueueItem).toHaveBeenCalledWith("qi-1", { notes: "" });
  });
});
