import { fetchWithRetry } from "./retry";

export const FETCH_POSTS_QUERY = `
  query FetchGroupPosts($groupId: ID!, $first: Int!, $after: String) {
    fetch__Group(id: $groupId) {
      name
      posts(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            markdown
            created
            author { id name }
            comments(first: 100) {
              edges {
                node {
                  markdown
                  created
                  author { name }
                  replies(first: 100) {
                    edges {
                      node {
                        markdown
                        created
                        author { name }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export interface PostNode {
  id: string;
  markdown: string;
  created: string;
  author: { id: string; name: string };
  comments: {
    edges: Array<{
      node: {
        markdown: string;
        created: string;
        author: { name: string };
        replies: {
          edges: Array<{
            node: {
              markdown: string;
              created: string;
              author: { name: string };
            };
          }>;
        };
      };
    }>;
  };
}

export interface FetchResponse {
  data?: {
    fetch__Group: {
      name: string;
      posts: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: PostNode }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export function formatPosts(posts: PostNode[]): string {
  const lines: string[] = [];
  for (const post of posts) {
    const date = new Date(post.created).toISOString().slice(0, 16).replace("T", " ");
    lines.push(`--- ${post.author.name} [${date}] ---`);
    lines.push(post.markdown);

    for (const { node: comment } of post.comments.edges) {
      const cDate = new Date(comment.created).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`  > ${comment.author.name} [${cDate}]:`);
      lines.push(`  ${comment.markdown}`);

      for (const { node: reply } of comment.replies.edges) {
        const rDate = new Date(reply.created).toISOString().slice(0, 16).replace("T", " ");
        lines.push(`    >> ${reply.author.name} [${rDate}]:`);
        lines.push(`    ${reply.markdown}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const MAX_PAGES = 10;

export async function fetchGroupPosts(
  graphqlUrl: string,
  authToken: string,
  groupId: string,
  start: string,
  end: string,
): Promise<PostNode[]> {
  const posts: PostNode[] = [];
  let cursor: string | null = null;

  // Compare timestamps numerically — lexical string comparison only works if
  // every value shares the exact same ISO format/precision/timezone.
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);

  for (let page = 0; page < MAX_PAGES; page++) {
    const variables: Record<string, unknown> = { groupId, first: 100 };
    if (cursor) variables.after = cursor;

    const response = await fetchWithRetry(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query: FETCH_POSTS_QUERY, variables }),
    });

    if (!response.ok) {
      throw new Error(`Slashwork API error: ${response.status}`);
    }

    const result = (await response.json()) as FetchResponse;
    if (result.errors?.length) {
      throw new Error(`GraphQL error: ${result.errors.map((e) => e.message).join(", ")}`);
    }

    const postsData = result.data?.fetch__Group?.posts;
    const nodes = postsData?.edges?.map((e) => e.node) ?? [];

    if (nodes.length === 0) break;

    for (const post of nodes) {
      const createdMs = Date.parse(post.created);
      if (createdMs >= startMs && createdMs <= endMs) {
        posts.push(post);
      }
    }

    const oldestInPage = Date.parse(nodes[nodes.length - 1]!.created);
    if (oldestInPage < startMs) break;

    if (!postsData?.pageInfo?.hasNextPage) break;
    cursor = postsData?.pageInfo?.endCursor ?? null;
    if (!cursor) break;
  }

  return posts;
}
