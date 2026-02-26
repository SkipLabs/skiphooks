import type { EventHandler, FormattedEvent } from "./types.ts";

const actionEmojis: Record<string, string> = {
  published: "🚀",
  created: "🆕",
  edited: "✏️",
};

const relevantActions = new Set(["published", "created", "edited"]);

interface ReleasePayload {
  action: string;
  release: {
    tag_name: string;
    name?: string | null;
    html_url: string;
    body?: string | null;
    prerelease?: boolean;
    draft?: boolean;
    author?: { login?: string } | null;
  };
  repository?: {
    full_name?: string;
  } | null;
}

export const releaseHandler: EventHandler = {
  isRelevantAction(action) {
    return action != null && relevantActions.has(action);
  },

  format(payload): FormattedEvent {
    const { action, release, repository } = payload as ReleasePayload;

    const emoji = actionEmojis[action] ?? "📦";
    const repoName = repository?.full_name ?? "unknown/repo";
    const author = release.author?.login ?? "unknown";
    const name = release.name ?? release.tag_name;

    const tags: string[] = [];
    if (release.prerelease) tags.push("pre-release");
    if (release.draft) tags.push("draft");

    const lines: string[] = [
      `${emoji} **Release** [${name}](${release.html_url}) was **${action}**`,
      "",
      `**Repo:** ${repoName}`,
      `**Tag:** \`${release.tag_name}\``,
      `**Author:** ${author}`,
    ];

    if (tags.length > 0) {
      lines.push(`**Flags:** ${tags.join(", ")}`);
    }

    if (release.body) {
      const excerpt =
        release.body.length > 300
          ? release.body.slice(0, 300) + "…"
          : release.body;
      lines.push("", `> ${excerpt.replace(/\n/g, "\n> ")}`);
    }

    return { markdown: lines.join("\n") };
  },
};
