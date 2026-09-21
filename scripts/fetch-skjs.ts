const GRAPHQL_URL = process.env.SLASHWORK_GRAPHQL_URL!;
const AUTH_TOKEN = process.env.SLASHWORK_AUTH_TOKEN_SKJS!;
const GROUP_ID = "g_d_Px84GPeIF977BNqP0fGn";
const TARGET_USER_ID = "u_a2ETYHMAkjim7bkFELtYfg";
const BASE_URL = "https://skiplabs.slashwork.com";
const postUrl = (id: string) => `${BASE_URL}/post/${id}`;
const userUrl = (id: string) => `${BASE_URL}/user/${id}`;

const FETCH_POSTS_QUERY = `
  query FetchGroupPosts($groupId: ID!, $first: Int!) {
    fetch__Group(id: $groupId) {
      name
      posts(first: $first) {
        edges {
          node {
            id
            markdown
            created
            author { id name }
            comments(first: 100) {
              edges {
                node {
                  id
                  markdown
                  created
                  author { id name }
                  replies(first: 100) {
                    edges {
                      node {
                        id
                        markdown
                        created
                        author { id name }
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

const DELETE_POST_MUTATION = `
  mutation DeletePost($postId: ID!) {
    deletePost(postId: $postId) { __typename }
  }
`;

interface Author {
  id: string;
  name: string;
}

interface Reply {
  id: string;
  markdown: string;
  created: string;
  author: Author;
}

interface Comment {
  id: string;
  markdown: string;
  created: string;
  author: Author;
  replies: { edges: Array<{ node: Reply }> };
}

interface Post {
  id: string;
  markdown: string;
  created: string;
  author: Author;
  comments: { edges: Array<{ node: Comment }> };
}

interface FetchResponse {
  data?: {
    fetch__Group: {
      name: string;
      posts: { edges: Array<{ node: Post }> };
    };
  };
  errors?: Array<{ message: string }>;
}

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${AUTH_TOKEN}`,
};

async function fetchPosts(first: number): Promise<Post[]> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: FETCH_POSTS_QUERY,
      variables: { groupId: GROUP_ID, first },
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as FetchResponse;
  if (result.errors?.length) {
    throw new Error(`GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
  }

  return result.data!.fetch__Group.posts.edges.map((e) => e.node);
}

async function deletePost(postId: string): Promise<void> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: DELETE_POST_MUTATION,
      variables: { postId },
    }),
  });

  if (!response.ok) {
    throw new Error(`Delete failed for ${postId}: ${response.status}`);
  }

  const result = (await response.json()) as { errors?: Array<{ message: string }> };
  if (result.errors?.length) {
    throw new Error(`Delete error for ${postId}: ${result.errors.map((e) => e.message).join(", ")}`);
  }
}

async function main(): Promise<void> {
  if (!AUTH_TOKEN) {
    console.error("SLASHWORK_AUTH_TOKEN_SKJS is empty — check .env");
    process.exit(1);
  }

  const dryRun = !process.argv.includes("--delete");

  const posts = await fetchPosts(100);
  const targetPosts = posts.filter((p) => p.author.id !== TARGET_USER_ID);

  const summarize = process.argv.includes("--summarize");

  if (summarize) {
    const resolveMentions = (text: string) =>
      text.replace(/\[(@[^\]]+)\]\(mention:\/\/user\/(u_[^)]+)\)/g, (_, name, id) => `[${name}](${userUrl(id)})`);

    const lines: string[] = [];
    for (const post of targetPosts) {
      const date = new Date(post.created).toLocaleString();
      lines.push(`--- Post by [${post.author.name}](${userUrl(post.author.id)}) [${date}] ---`);
      lines.push(`Link: ${postUrl(post.id)}`);
      lines.push(resolveMentions(post.markdown));

      const comments = post.comments.edges.map((e) => e.node);
      for (const comment of comments) {
        const cDate = new Date(comment.created).toLocaleString();
        lines.push(`  > [${comment.author.name}](${userUrl(comment.author.id)}) [${cDate}]:`);
        lines.push(`  ${resolveMentions(comment.markdown)}`);

        const replies = comment.replies.edges.map((e) => e.node);
        for (const reply of replies) {
          const rDate = new Date(reply.created).toLocaleString();
          lines.push(`    >> [${reply.author.name}](${userUrl(reply.author.id)}) [${rDate}]:`);
          lines.push(`    ${resolveMentions(reply.markdown)}`);
        }
      }
      lines.push("");
    }
    console.log(lines.join("\n"));
    return;
  }

  console.log(`Found ${targetPosts.length} posts NOT by ${TARGET_USER_ID} (out of ${posts.length} total)\n`);

  for (const post of targetPosts) {
    const date = new Date(post.created).toLocaleString();
    const preview = post.markdown.split("\n")[0].slice(0, 120);
    console.log(`  [${date}] ${post.author.name}: ${post.id}`);
    console.log(`    ${preview}`);

    const comments = post.comments.edges.map((e) => e.node);
    for (const comment of comments) {
      const cDate = new Date(comment.created).toLocaleString();
      const cPreview = comment.markdown.split("\n")[0].slice(0, 120);
      console.log(`    └─ [${cDate}] ${comment.author.name}:`);
      console.log(`       ${cPreview}`);

      const replies = comment.replies.edges.map((e) => e.node);
      for (const reply of replies) {
        const rDate = new Date(reply.created).toLocaleString();
        const rPreview = reply.markdown.split("\n")[0].slice(0, 120);
        console.log(`       └─ [${rDate}] ${reply.author.name}:`);
        console.log(`          ${rPreview}`);
      }
    }
    console.log();
  }

  if (!process.argv.includes("--delete")) {
    console.log("\nDry run — pass --delete to actually remove these posts.");
    return;
  }

  console.log(`\nDeleting ${targetPosts.length} posts...`);
  let deleted = 0;
  for (const post of targetPosts) {
    await deletePost(post.id);
    deleted++;
    process.stdout.write(`\r  Deleted ${deleted}/${targetPosts.length}`);
  }
  console.log("\nDone.");
}

main();
