import { test, expect, describe } from "bun:test";
import { blockquoteExcerpt, relevantActionMatcher } from "./utils";

describe("blockquoteExcerpt", () => {
  test("prefixes a single line with a blockquote marker", () => {
    expect(blockquoteExcerpt("hello", 200)).toBe("> hello");
  });

  test("prefixes every line of a multi-line body", () => {
    expect(blockquoteExcerpt("a\nb\nc", 200)).toBe("> a\n> b\n> c");
  });

  test("does not truncate when under the limit", () => {
    const body = "x".repeat(50);
    expect(blockquoteExcerpt(body, 200)).toBe(`> ${body}`);
  });

  test("truncates to maxLen and appends an ellipsis character", () => {
    const body = "x".repeat(300);
    const result = blockquoteExcerpt(body, 200);
    // "> " + 200 x's + "…"
    expect(result).toBe(`> ${"x".repeat(200)}…`);
  });

  test("uses the ellipsis character, not three dots", () => {
    const result = blockquoteExcerpt("y".repeat(10), 5);
    expect(result).toContain("…");
    expect(result).not.toContain("...");
  });

  test("truncation happens before blockquote prefixing of later lines", () => {
    const body = "a".repeat(5) + "\n" + "b".repeat(5);
    // limit cuts inside the first segment, so no newline survives
    expect(blockquoteExcerpt(body, 3)).toBe("> aaa…");
  });
});

describe("relevantActionMatcher", () => {
  const matcher = relevantActionMatcher("opened", "closed");

  test("matches a listed action", () => {
    expect(matcher("opened")).toBe(true);
    expect(matcher("closed")).toBe(true);
  });

  test("rejects an unlisted action", () => {
    expect(matcher("labeled")).toBe(false);
  });

  test("rejects undefined", () => {
    expect(matcher(undefined)).toBe(false);
  });

  test("an empty matcher rejects everything including undefined", () => {
    const none = relevantActionMatcher();
    expect(none("opened")).toBe(false);
    expect(none(undefined)).toBe(false);
  });
});
