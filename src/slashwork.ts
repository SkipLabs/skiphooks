const CREATE_POST_MUTATION = `
  mutation CreatePRPost($groupId: ID!, $markdown: String!) {
    createPost(input: { groupId: $groupId, markdown: $markdown }) {
      node { id }
    }
  }
`;

interface SlashworkConfig {
  graphqlUrl: string;
  appToken: string;
  groupId: string;
}

export function getSlashworkConfig(): SlashworkConfig {
  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  const appToken = process.env.SLASHWORK_APP_TOKEN;
  const groupId = process.env.SLASHWORK_GROUP_ID;

  if (!graphqlUrl || !appToken || !groupId) {
    throw new Error(
      "Missing required env vars: SLASHWORK_GRAPHQL_URL, SLASHWORK_APP_TOKEN, SLASHWORK_GROUP_ID",
    );
  }

  return { graphqlUrl, appToken, groupId };
}

export async function postToSlashwork(
  config: SlashworkConfig,
  markdown: string,
): Promise<void> {
  const response = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.appToken}`,
    },
    body: JSON.stringify({
      query: CREATE_POST_MUTATION,
      variables: {
        groupId: config.groupId,
        markdown,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Slashwork API error: ${response.status} ${response.statusText} - ${body}`,
    );
  }

  const result = (await response.json()) as {
    errors?: Array<{ message: string }>;
  };
  if (result.errors?.length) {
    throw new Error(
      `Slashwork GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
}
