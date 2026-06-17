import type { SlashworkConnection } from "./slashwork";
import { fetchWithRetry } from "./retry";

const FETCH_GROUPS_QUERY = `
  query FetchGroups {
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

interface FetchGroupsResponse {
  data?: {
    mentionGroups: {
      edges: Array<{ node: { id: string; name: string } }>;
    };
  };
  errors?: Array<{ message: string }>;
}

export async function fetchSlashworkGroups(
  connection: SlashworkConnection,
): Promise<Array<{ slashworkId: string; name: string }>> {
  const response = await fetchWithRetry(connection.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.authToken}`,
    },
    body: JSON.stringify({ query: FETCH_GROUPS_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Slashwork API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as FetchGroupsResponse;
  if (result.errors?.length) {
    throw new Error(`GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`);
  }

  return (result.data?.mentionGroups?.edges ?? [])
    .map((e) => ({ slashworkId: e.node.id, name: e.node.name }))
    .filter((g) => g.name.length > 0);
}
