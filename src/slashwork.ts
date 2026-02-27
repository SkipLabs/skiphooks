const VIEWER_QUERY = `
  query Viewer {
    viewer { __typename }
  }
`;

const CREATE_POST_MUTATION = `
  mutation CreatePost($groupId: ID!, $markdown: String!) {
    createPost(groupId: $groupId, input: { markdown: $markdown }) {
      node { id }
    }
  }
`;

export interface SlashworkConnection {
  graphqlUrl: string;
  authToken: string;
}

export async function validateConnection(
  connection: SlashworkConnection,
): Promise<void> {
  const response = await fetch(connection.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.authToken}`,
    },
    body: JSON.stringify({ query: VIEWER_QUERY }),
  });

  if (!response.ok) {
    throw new Error(
      `Slashwork API unreachable: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as {
    errors?: Array<{ message: string }>;
  };
  if (result.errors?.length) {
    throw new Error(
      `Slashwork auth failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
}

export async function postToSlashwork(
  connection: SlashworkConnection,
  groupId: string,
  markdown: string,
): Promise<void> {
  const response = await fetch(connection.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.authToken}`,
    },
    body: JSON.stringify({
      query: CREATE_POST_MUTATION,
      variables: {
        groupId,
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
