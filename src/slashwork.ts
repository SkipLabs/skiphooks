const CREATE_POST_MUTATION = `
  mutation CreatePRPost($groupId: ID!, $markdown: String!) {
    createPost(input: { groupId: $groupId, markdown: $markdown }) {
      node { id }
    }
  }
`;

export interface SlashworkConnection {
  graphqlUrl: string;
  accessToken: string;
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
      Authorization: `Bearer ${connection.accessToken}`,
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
