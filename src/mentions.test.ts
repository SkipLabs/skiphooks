import { test, expect, describe, mock } from "bun:test";

// Mock the db module before importing mentions
mock.module("./db", () => ({
  getUserMappingsBatch: async (usernames: string[]) => {
    const mappings: Record<string, string> = {
      hubyrod: "hugo",
      octocat: "octo",
      jdoe: "johnd",
    };
    const map = new Map<string, string>();
    for (const u of usernames) {
      const lower = u.toLowerCase();
      if (lower in mappings) {
        map.set(lower, mappings[lower]!);
      }
    }
    return map;
  },
}));

const { processGitHubMentions } = await import("./mentions");

describe("processGitHubMentions", () => {
  test("appends cc line for PR author with mapping", async () => {
    const markdown = "🟢 **PR #1** [Title](url) was **opened**\n\n**Author:** hubyrod";
    const payload = {
      action: "opened",
      pull_request: {
        user: { login: "hubyrod" },
        requested_reviewers: [],
        assignees: [],
      },
    };

    const result = await processGitHubMentions(markdown, payload, "pull_request");
    expect(result).toContain("---\n**cc:** @hugo");
  });

  test("appends multiple cc users", async () => {
    const markdown = "🔵 **PR #2** [Title](url) was **review_requested**";
    const payload = {
      action: "review_requested",
      pull_request: {
        user: { login: "hubyrod" },
        requested_reviewers: [{ login: "octocat" }],
        assignees: [],
      },
    };

    const result = await processGitHubMentions(markdown, payload, "pull_request");
    expect(result).toContain("@hugo");
    expect(result).toContain("@octo");
  });

  test("returns unchanged markdown when no mappings match", async () => {
    const markdown = "🟢 **PR #1** [Title](url) was **opened**\n\n**Author:** unknown-user";
    const payload = {
      action: "opened",
      pull_request: {
        user: { login: "unknown-user" },
        requested_reviewers: [],
        assignees: [],
      },
    };

    const result = await processGitHubMentions(markdown, payload, "pull_request");
    expect(result).toBe(markdown);
  });

  test("extracts inline @mentions from markdown", async () => {
    const markdown = "💬 **someone** commented\n\n> Hey @hubyrod can you review this?";
    const payload = {
      action: "created",
      comment: { user: { login: "someone" } },
      issue: { user: { login: "someone" } },
    };

    const result = await processGitHubMentions(markdown, payload, "issue_comment");
    expect(result).toContain("@hugo");
  });

  test("skips @mentions inside code blocks", async () => {
    const markdown = "💬 **someone** commented\n\n> ```\n> @hubyrod fix this\n> ```";
    const payload = {
      action: "created",
      comment: { user: { login: "someone" } },
      issue: { user: { login: "someone" } },
    };

    const result = await processGitHubMentions(markdown, payload, "issue_comment");
    // "someone" has no mapping, and @hubyrod is inside code block
    expect(result).toBe(markdown);
  });

  test("skips @mentions inside inline code", async () => {
    const markdown = "💬 **someone** commented\n\n> Use `@hubyrod` as the value";
    const payload = {
      action: "created",
      comment: { user: { login: "someone" } },
      issue: { user: { login: "someone" } },
    };

    const result = await processGitHubMentions(markdown, payload, "issue_comment");
    expect(result).toBe(markdown);
  });

  test("extracts issue assignee from structured fields", async () => {
    const markdown = "👤 **Issue #5** [Bug](url) was **assigned**\n\n**Assigned to:** hubyrod";
    const payload = {
      action: "assigned",
      issue: {
        user: { login: "someone" },
        assignees: [{ login: "hubyrod" }],
      },
      assignee: { login: "hubyrod" },
    };

    const result = await processGitHubMentions(markdown, payload, "issues");
    expect(result).toContain("@hugo");
  });

  test("extracts PR reviewer from structured fields", async () => {
    const markdown = "✅ **octocat** approved PR #3 [Title](url)";
    const payload = {
      action: "submitted",
      review: { user: { login: "octocat" } },
      pull_request: { user: { login: "hubyrod" } },
    };

    const result = await processGitHubMentions(markdown, payload, "pull_request_review");
    expect(result).toContain("@octo");
    expect(result).toContain("@hugo");
  });

  test("deduplicates when same user appears in both structured and inline", async () => {
    const markdown = "🟢 **PR #1** by @hubyrod was **opened**";
    const payload = {
      action: "opened",
      pull_request: {
        user: { login: "hubyrod" },
        requested_reviewers: [],
        assignees: [],
      },
    };

    const result = await processGitHubMentions(markdown, payload, "pull_request");
    const matches = result.match(/@hugo/g);
    expect(matches).toHaveLength(1);
  });

  test("handles push events", async () => {
    const markdown = "⬆️ **Push** to `main`\n\n**Pushed by:** hubyrod";
    const payload = {
      pusher: { name: "hubyrod" },
    };

    const result = await processGitHubMentions(markdown, payload, "push");
    expect(result).toContain("@hugo");
  });

  test("case-insensitive username matching", async () => {
    const markdown = "🟢 **PR #1** [Title](url) was **opened**";
    const payload = {
      action: "opened",
      pull_request: {
        user: { login: "HubyRod" },
        requested_reviewers: [],
        assignees: [],
      },
    };

    const result = await processGitHubMentions(markdown, payload, "pull_request");
    expect(result).toContain("@hugo");
  });
});
