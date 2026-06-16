import { upsertDiscoveredGroups } from "./db";
import type { SlashworkConnection } from "./slashwork";

const GROUP_SEARCH_QUERY = `
  query DiscoverGroups {
    mentionGroups(first: -1, displayType: FEED) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

interface GroupSearchResponse {
  data?: {
    mentionGroups: {
      edges: Array<{ node: { id: string; name: string } }>;
    };
  };
  errors?: Array<{ message: string }>;
}

export async function syncSlashworkGroups(
  connection: SlashworkConnection,
  log: (level: string, message: string) => void,
): Promise<number> {
  const response = await fetch(connection.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.authToken}`,
    },
    body: JSON.stringify({ query: GROUP_SEARCH_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Slashwork API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as GroupSearchResponse;
  if (result.errors?.length) {
    throw new Error(`GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`);
  }

  const groups = result.data?.mentionGroups?.edges?.map((e) => ({
    slashworkId: e.node.id,
    name: e.node.name,
  })) ?? [];

  if (groups.length > 0) {
    await upsertDiscoveredGroups(groups);
  }

  log("info", `Group sync: discovered ${groups.length} groups`);
  return groups.length;
}

type LogFn = (level: string, message: string) => void;

export function startGroupSyncPoller(
  connection: SlashworkConnection,
  log: LogFn,
  intervalMs: number = 24 * 60 * 60 * 1000, // 24 hours
): ReturnType<typeof setInterval> {
  // Run immediately on startup
  syncSlashworkGroups(connection, log).catch((err) =>
    log("error", `Group sync failed: ${err}`),
  );

  // Then repeat on interval
  return setInterval(() => {
    syncSlashworkGroups(connection, log).catch((err) =>
      log("error", `Group sync failed: ${err}`),
    );
  }, intervalMs);
}
