import { test, expect, mock, describe, beforeEach, afterEach } from "bun:test";
import { listOwnerRepos, formatRepoActivity, type RepoActivity } from "./github-utils";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("listOwnerRepos", () => {
  test("returns repo names from org endpoint", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify([{ name: "repo-a" }, { name: "repo-b" }]), { status: 200 }))
    ) as unknown as typeof fetch;
    const names = await listOwnerRepos("skiplabs");
    expect(names).toEqual(["repo-a", "repo-b"]);
  });

  test("falls back to user endpoint when org endpoint fails", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }
      return Promise.resolve(new Response(JSON.stringify([{ name: "user-repo" }]), { status: 200 }));
    }) as unknown as typeof fetch;
    const names = await listOwnerRepos("someuser");
    expect(names).toEqual(["user-repo"]);
    expect(calls).toBe(2);
  });

  test("sends Authorization header when token is provided", async () => {
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((_url, init) => {
      capturedHeaders = new Headers((init as RequestInit).headers as HeadersInit);
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }) as unknown as typeof fetch;
    await listOwnerRepos("skiplabs", "gh-token-123");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer gh-token-123");
  });

  test("returns empty array when no repos exist", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    ) as unknown as typeof fetch;
    const names = await listOwnerRepos("emptyorg");
    expect(names).toEqual([]);
  });
});

describe("formatRepoActivity", () => {
  test("includes header with owner/repo", () => {
    const activity: RepoActivity = { mergedPRs: [], openedPRs: [], releases: [], commits: [] };
    const result = formatRepoActivity("myorg", "myrepo", activity);
    expect(result).toContain("=== GitHub: myorg/myrepo ===");
  });

  test("shows 'No activity found' when all arrays are empty", () => {
    const activity: RepoActivity = { mergedPRs: [], openedPRs: [], releases: [], commits: [] };
    const result = formatRepoActivity("org", "repo", activity);
    expect(result).toContain("No activity found");
  });

  test("formats merged PRs with number, title, author, and date", () => {
    const activity: RepoActivity = {
      mergedPRs: [
        {
          number: 42,
          title: "Fix critical bug",
          merged_at: "2026-06-10T12:00:00Z",
          created_at: "2026-06-09T10:00:00Z",
          user: { login: "alice" },
        },
      ],
      openedPRs: [],
      releases: [],
      commits: [],
    };
    const result = formatRepoActivity("org", "repo", activity);
    expect(result).toContain("**Merged Pull Requests:**");
    expect(result).toContain("#42 Fix critical bug");
    expect(result).toContain("@alice");
    expect(result).toContain("2026-06-10");
  });

  test("formats releases with name and date", () => {
    const activity: RepoActivity = {
      mergedPRs: [],
      openedPRs: [],
      releases: [
        { tag_name: "v1.2.3", name: "Release 1.2.3", published_at: "2026-06-08T10:00:00Z", body: null },
      ],
      commits: [],
    };
    const result = formatRepoActivity("org", "repo", activity);
    expect(result).toContain("**Releases:**");
    expect(result).toContain("Release 1.2.3");
    expect(result).toContain("2026-06-08");
  });

  test("truncates commit list at 20 and shows remainder count", () => {
    const commits = Array.from({ length: 25 }, (_, i) => ({
      sha: `abc${String(i).padStart(4, "0")}`,
      commit: {
        message: `Commit ${i}`,
        author: { name: "Dev", date: "2026-06-10T00:00:00Z" },
      },
      author: { login: "dev" },
    }));
    const activity: RepoActivity = { mergedPRs: [], openedPRs: [], releases: [], commits };
    const result = formatRepoActivity("org", "repo", activity);
    expect(result).toContain("... and 5 more");
  });

  test("uses tag_name as fallback when release name is null", () => {
    const activity: RepoActivity = {
      mergedPRs: [],
      openedPRs: [],
      releases: [
        { tag_name: "v2.0.0", name: null, published_at: "2026-06-08T10:00:00Z", body: null },
      ],
      commits: [],
    };
    const result = formatRepoActivity("org", "repo", activity);
    expect(result).toContain("v2.0.0");
  });
});
