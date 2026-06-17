/** Truncate `body` to `maxLen` chars (with an ellipsis) and render it as a markdown blockquote. */
export function blockquoteExcerpt(body: string, maxLen: number): string {
  const excerpt = body.length > maxLen ? body.slice(0, maxLen) + "…" : body;
  return `> ${excerpt.replace(/\n/g, "\n> ")}`;
}

/** Build an `isRelevantAction` predicate that matches a fixed set of action names. */
export function relevantActionMatcher(
  ...actions: string[]
): (action: string | undefined) => boolean {
  const set = new Set(actions);
  return (action) => action != null && set.has(action);
}
