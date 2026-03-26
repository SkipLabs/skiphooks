import { test, expect } from "bun:test";
import { pullRequestHandler } from "./pull-request";
import { issuesHandler } from "./issues";
import { issueCommentHandler } from "./issue-comment";
import { pushHandler } from "./push";
import { releaseHandler } from "./release";
import { workflowRunHandler } from "./workflow-run";
import { deploymentStatusHandler } from "./deployment-status";
import { pullRequestReviewHandler } from "./pull-request-review";
import { checkSuiteHandler } from "./check-suite";

// Pull Request handler

test("pullRequestHandler: filters irrelevant actions", () => {
  expect(pullRequestHandler.isRelevantAction("opened")).toBe(true);
  expect(pullRequestHandler.isRelevantAction("closed")).toBe(true);
  expect(pullRequestHandler.isRelevantAction("synchronize")).toBe(true);
  expect(pullRequestHandler.isRelevantAction("edited")).toBe(false);
  expect(pullRequestHandler.isRelevantAction(undefined)).toBe(false);
});

test("pullRequestHandler: formats opened PR", () => {
  const { markdown } = pullRequestHandler.format({
    action: "opened",
    pull_request: {
      number: 42,
      title: "Add feature",
      html_url: "https://github.com/org/repo/pull/42",
      user: { login: "alice" },
      head: { ref: "feature" },
      base: { ref: "main" },
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("PR #42");
  expect(markdown).toContain("Add feature");
  expect(markdown).toContain("opened");
  expect(markdown).toContain("alice");
  expect(markdown).toContain("`feature` → `main`");
});

test("pullRequestHandler: closed + merged shows merged", () => {
  const { markdown } = pullRequestHandler.format({
    action: "closed",
    pull_request: {
      number: 1,
      title: "Fix",
      html_url: "https://github.com/o/r/pull/1",
      merged: true,
    },
  });

  expect(markdown).toContain("merged");
  expect(markdown).not.toContain("closed");
});

test("pullRequestHandler: truncates long body", () => {
  const { markdown } = pullRequestHandler.format({
    action: "opened",
    pull_request: {
      number: 1,
      title: "Fix",
      html_url: "https://github.com/o/r/pull/1",
      body: "x".repeat(300),
    },
  });

  expect(markdown).toContain("…");
});

// Issues handler

test("issuesHandler: filters irrelevant actions", () => {
  expect(issuesHandler.isRelevantAction("opened")).toBe(true);
  expect(issuesHandler.isRelevantAction("closed")).toBe(true);
  expect(issuesHandler.isRelevantAction("labeled")).toBe(true);
  expect(issuesHandler.isRelevantAction("transferred")).toBe(false);
  expect(issuesHandler.isRelevantAction(undefined)).toBe(false);
});

test("issuesHandler: formats opened issue", () => {
  const { markdown } = issuesHandler.format({
    action: "opened",
    issue: {
      number: 10,
      title: "Bug report",
      html_url: "https://github.com/org/repo/issues/10",
      user: { login: "bob" },
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("Issue #10");
  expect(markdown).toContain("Bug report");
  expect(markdown).toContain("bob");
});

test("issuesHandler: includes label when labeled", () => {
  const { markdown } = issuesHandler.format({
    action: "labeled",
    issue: {
      number: 5,
      title: "Task",
      html_url: "https://github.com/o/r/issues/5",
    },
    label: { name: "bug" },
  });

  expect(markdown).toContain("`bug`");
});

// Issue Comment handler

test("issueCommentHandler: filters irrelevant actions", () => {
  expect(issueCommentHandler.isRelevantAction("created")).toBe(true);
  expect(issueCommentHandler.isRelevantAction("edited")).toBe(false);
  expect(issueCommentHandler.isRelevantAction("deleted")).toBe(false);
  expect(issueCommentHandler.isRelevantAction(undefined)).toBe(false);
});

test("issueCommentHandler: formats comment on issue", () => {
  const { markdown } = issueCommentHandler.format({
    action: "created",
    comment: {
      html_url: "https://github.com/org/repo/issues/10#issuecomment-1",
      body: "Looks good to me!",
      user: { login: "alice" },
    },
    issue: {
      number: 10,
      title: "Bug report",
      html_url: "https://github.com/org/repo/issues/10",
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("alice");
  expect(markdown).toContain("Issue #10");
  expect(markdown).toContain("Bug report");
  expect(markdown).toContain("Looks good to me!");
});

test("issueCommentHandler: shows PR for pull request comments", () => {
  const { markdown } = issueCommentHandler.format({
    action: "created",
    comment: {
      html_url: "https://github.com/org/repo/pull/5#issuecomment-1",
      body: "LGTM",
      user: { login: "bob" },
    },
    issue: {
      number: 5,
      title: "Add feature",
      html_url: "https://github.com/org/repo/pull/5",
      pull_request: { url: "https://api.github.com/repos/org/repo/pulls/5" },
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("PR #5");
  expect(markdown).not.toContain("Issue #5");
});

test("issueCommentHandler: truncates long comment body", () => {
  const { markdown } = issueCommentHandler.format({
    action: "created",
    comment: {
      html_url: "#",
      body: "x".repeat(300),
      user: { login: "alice" },
    },
    issue: {
      number: 1,
      title: "Test",
      html_url: "#",
    },
  });

  expect(markdown).toContain("…");
});

// Push handler

test("pushHandler: always relevant", () => {
  expect(pushHandler.isRelevantAction(undefined)).toBe(true);
  expect(pushHandler.isRelevantAction("anything")).toBe(true);
});

test("pushHandler: formats push with commits", () => {
  const { markdown } = pushHandler.format({
    ref: "refs/heads/main",
    pusher: { name: "alice" },
    compare: "https://github.com/o/r/compare/abc...def",
    commits: [
      { id: "abc1234567", message: "Fix bug", url: "https://github.com/o/r/commit/abc1234567" },
      { id: "def7654321", message: "Add test", url: "https://github.com/o/r/commit/def7654321" },
    ],
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("`main`");
  expect(markdown).toContain("alice");
  expect(markdown).toContain("Commits:** 2");
  expect(markdown).toContain("`abc1234`");
  expect(markdown).toContain("Fix bug");
  expect(markdown).toContain("View diff");
});

test("pushHandler: truncates after 5 commits", () => {
  const commits = Array.from({ length: 7 }, (_, i) => ({
    id: `commit${i}`.padEnd(10, "0"),
    message: `Commit ${i}`,
    url: "#",
  }));

  const { markdown } = pushHandler.format({
    ref: "refs/heads/main",
    pusher: { name: "alice" },
    commits,
  });

  expect(markdown).toContain("… and 2 more");
});

// Release handler

test("releaseHandler: filters irrelevant actions", () => {
  expect(releaseHandler.isRelevantAction("published")).toBe(true);
  expect(releaseHandler.isRelevantAction("created")).toBe(true);
  expect(releaseHandler.isRelevantAction("deleted")).toBe(false);
  expect(releaseHandler.isRelevantAction(undefined)).toBe(false);
});

test("releaseHandler: formats published release", () => {
  const { markdown } = releaseHandler.format({
    action: "published",
    release: {
      tag_name: "v1.0.0",
      name: "Version 1.0",
      html_url: "https://github.com/o/r/releases/tag/v1.0.0",
      author: { login: "alice" },
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("Version 1.0");
  expect(markdown).toContain("`v1.0.0`");
  expect(markdown).toContain("published");
  expect(markdown).toContain("alice");
});

test("releaseHandler: shows prerelease and draft flags", () => {
  const { markdown } = releaseHandler.format({
    action: "published",
    release: {
      tag_name: "v2.0.0-beta",
      html_url: "#",
      prerelease: true,
      draft: true,
    },
  });

  expect(markdown).toContain("pre-release");
  expect(markdown).toContain("draft");
});

// Workflow Run handler

test("workflowRunHandler: filters irrelevant actions", () => {
  expect(workflowRunHandler.isRelevantAction("completed")).toBe(true);
  expect(workflowRunHandler.isRelevantAction("requested")).toBe(false);
  expect(workflowRunHandler.isRelevantAction(undefined)).toBe(false);
});

test("workflowRunHandler: formats completed run", () => {
  const { markdown } = workflowRunHandler.format({
    action: "completed",
    workflow_run: {
      id: 123,
      name: "CI",
      html_url: "https://github.com/o/r/actions/runs/123",
      conclusion: "success",
      head_branch: "main",
      head_sha: "abc1234567",
      run_number: 42,
      actor: { login: "alice" },
      run_started_at: "2025-01-01T10:00:00Z",
      updated_at: "2025-01-01T10:05:30Z",
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("CI");
  expect(markdown).toContain("#42");
  expect(markdown).toContain("success");
  expect(markdown).toContain("alice");
  expect(markdown).toContain("`main`");
  expect(markdown).toContain("5m 30s");
  expect(markdown).toContain("View run");
});

test("workflowRunHandler: shows failure conclusion", () => {
  const { markdown } = workflowRunHandler.format({
    action: "completed",
    workflow_run: {
      id: 1,
      html_url: "#",
      conclusion: "failure",
      head_branch: "feature",
    },
  });

  expect(markdown).toContain("failure");
});

// Deployment Status handler

test("deploymentStatusHandler: always relevant", () => {
  expect(deploymentStatusHandler.isRelevantAction(undefined)).toBe(true);
  expect(deploymentStatusHandler.isRelevantAction("created")).toBe(true);
});

test("deploymentStatusHandler: formats success deployment", () => {
  const { markdown } = deploymentStatusHandler.format({
    deployment_status: {
      state: "success",
      description: "Deployed successfully",
      target_url: "https://app.example.com",
    },
    deployment: {
      ref: "main",
      environment: "production",
      creator: { login: "alice" },
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("production");
  expect(markdown).toContain("success");
  expect(markdown).toContain("alice");
  expect(markdown).toContain("`main`");
  expect(markdown).toContain("Deployed successfully");
  expect(markdown).toContain("View deployment");
});

// Pull Request Review handler

test("pullRequestReviewHandler: filters irrelevant actions", () => {
  expect(pullRequestReviewHandler.isRelevantAction("submitted")).toBe(true);
  expect(pullRequestReviewHandler.isRelevantAction("dismissed")).toBe(false);
  expect(pullRequestReviewHandler.isRelevantAction(undefined)).toBe(false);
});

test("pullRequestReviewHandler: formats approval", () => {
  const { markdown } = pullRequestReviewHandler.format({
    action: "submitted",
    review: {
      state: "approved",
      html_url: "https://github.com/o/r/pull/5#pullrequestreview-1",
      body: "LGTM!",
      user: { login: "bob" },
    },
    pull_request: {
      number: 5,
      title: "Add feature",
      html_url: "https://github.com/o/r/pull/5",
    },
    repository: { full_name: "org/repo" },
  });

  expect(markdown).toContain("bob");
  expect(markdown).toContain("approved");
  expect(markdown).toContain("PR #5");
  expect(markdown).toContain("LGTM!");
});

test("pullRequestReviewHandler: formats changes requested", () => {
  const { markdown } = pullRequestReviewHandler.format({
    action: "submitted",
    review: {
      state: "changes_requested",
      html_url: "#",
      user: { login: "carol" },
    },
    pull_request: {
      number: 10,
      title: "Refactor",
      html_url: "#",
    },
  });

  expect(markdown).toContain("changes requested");
  expect(markdown).toContain("carol");
});

// Check Suite handler

test("checkSuiteHandler: filters irrelevant actions", () => {
  expect(checkSuiteHandler.isRelevantAction("completed")).toBe(true);
  expect(checkSuiteHandler.isRelevantAction("requested")).toBe(false);
  expect(checkSuiteHandler.isRelevantAction(undefined)).toBe(false);
});

test("checkSuiteHandler: formats completed check suite", () => {
  const { markdown } = checkSuiteHandler.format({
    action: "completed",
    check_suite: {
      conclusion: "success",
      head_branch: "main",
      head_sha: "abc1234567",
      app: { name: "GitHub Actions", slug: "github-actions" },
    },
    repository: { full_name: "org/repo", html_url: "https://github.com/org/repo" },
  });

  expect(markdown).toContain("GitHub Actions");
  expect(markdown).toContain("`main`");
  expect(markdown).toContain("success");
  expect(markdown).toContain("`abc1234`");
});

test("checkSuiteHandler: shows failure", () => {
  const { markdown } = checkSuiteHandler.format({
    action: "completed",
    check_suite: {
      conclusion: "failure",
      head_branch: "feature",
      head_sha: "def",
    },
    repository: { full_name: "o/r", html_url: "#" },
  });

  expect(markdown).toContain("failure");
});
