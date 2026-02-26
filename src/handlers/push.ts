import type { EventHandler, FormattedEvent } from "./types.ts";

interface PushPayload {
  ref: string;
  pusher: { name?: string } | null;
  compare?: string;
  commits?: Array<{
    id?: string;
    message?: string;
    url?: string;
    author?: { username?: string } | null;
  }>;
  repository?: {
    full_name?: string;
  } | null;
}

export const pushHandler: EventHandler = {
  isRelevantAction() {
    // Push events have no action field — always relevant
    return true;
  },

  format(payload): FormattedEvent {
    const { ref, pusher, compare, commits, repository } =
      payload as PushPayload;

    const branch = ref.replace("refs/heads/", "");
    const repoName = repository?.full_name ?? "unknown/repo";
    const pusherName = pusher?.name ?? "unknown";
    const commitCount = commits?.length ?? 0;

    const lines: string[] = [
      `⬆️ **Push** to \`${branch}\` on **${repoName}**`,
      "",
      `**Pushed by:** ${pusherName}`,
      `**Commits:** ${commitCount}`,
    ];

    if (commits && commits.length > 0) {
      const shown = commits.slice(0, 5);
      lines.push("");
      for (const c of shown) {
        const short = c.id?.slice(0, 7) ?? "???????";
        const msg = c.message?.split("\n")[0] ?? "(no message)";
        lines.push(`- [\`${short}\`](${c.url ?? "#"}) ${msg}`);
      }
      if (commits.length > 5) {
        lines.push(`- … and ${commits.length - 5} more`);
      }
    }

    if (compare) {
      lines.push("", `[View diff](${compare})`);
    }

    return { markdown: lines.join("\n") };
  },
};
