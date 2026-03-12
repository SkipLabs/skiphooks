import type { RedditPost, RedditComment, CommentTree } from "@/src/types/reddit";
import type { CrawlRun, QueueItem, SavedThread } from "@/src/types/storage";

export function makePost(id: string, subreddit = "programming"): RedditPost {
  return {
    id,
    title: `Post ${id}`,
    url: `https://reddit.com/r/${subreddit}/comments/${id}/`,
    subreddit,
    upvotes: 10,
    numComments: 5,
    selftext: "Some text",
    author: "user1",
    createdUtc: Date.now() / 1000,
  };
}

export function makeComment(
  id: string,
  postId: string,
  depth = 0,
  overrides: Partial<RedditComment> = {}
): RedditComment {
  return {
    id,
    postId,
    parentId: postId,
    body: `Comment ${id}`,
    author: "commenter",
    upvotes: 5,
    depth,
    createdUtc: Date.now() / 1000,
    parentChain: [],
    ...overrides,
  };
}

export function makeThread(overrides: Partial<SavedThread> = {}): SavedThread {
  return {
    id: "thread-1",
    postId: "post-1",
    title: "Test Thread",
    url: "https://reddit.com/r/programming/comments/post-1/",
    subreddit: "programming",
    relevanceScore: 0.8,
    reasoning: "Relevant",
    suggestedTopics: ["ai"],
    savedAt: new Date(),
    ...overrides,
  };
}

export function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "qi-1",
    threadId: "thread-1",
    commentId: "comment-1",
    commentBody: "Test comment body",
    commentUrl: "https://reddit.com/r/programming/comments/post-1/comment-1/",
    author: "testuser",
    upvotes: 10,
    depth: 0,
    relevanceScore: 0.9,
    reasoning: "Relevant comment",
    replyAngle: "Mention Skipper",
    urgency: "high",
    status: "pending",
    parentChain: [],
    savedAt: new Date(),
    repliedAt: null,
    notes: null,
    ...overrides,
  };
}

export function makeCrawlRun(overrides: Partial<CrawlRun> = {}): CrawlRun {
  return {
    id: "crawl-1",
    startedAt: new Date(),
    completedAt: null,
    subreddits: ["programming"],
    threadsScanned: 0,
    threadsSaved: 0,
    commentsSaved: 0,
    errorMessage: null,
    ...overrides,
  };
}

export function makeCommentTree(
  postId: string,
  comments: RedditComment[] = []
): CommentTree {
  return {
    post: makePost(postId),
    comments,
  };
}

export function makeRedditListing(
  posts: Array<{
    id: string;
    title?: string;
    permalink?: string;
    subreddit?: string;
    score?: number;
    num_comments?: number;
    selftext?: string;
    author?: string;
    created_utc?: number;
  }>
) {
  return {
    data: {
      children: posts.map((p) => ({
        data: {
          id: p.id,
          title: p.title ?? `Post ${p.id}`,
          permalink: p.permalink ?? `/r/programming/comments/${p.id}/`,
          subreddit: p.subreddit ?? "programming",
          score: p.score ?? 10,
          num_comments: p.num_comments ?? 5,
          selftext: p.selftext ?? "Some text",
          author: p.author ?? "user1",
          created_utc: p.created_utc ?? Date.now() / 1000,
        },
      })),
    },
  };
}

export function makeRedditCommentNode(
  data: {
    id: string;
    body?: string;
    author?: string;
    score?: number;
    parent_id?: string;
    created_utc?: number;
    depth?: number;
    replies?: unknown;
  },
  kind = "t1"
) {
  return {
    kind,
    data: {
      id: data.id,
      body: data.body ?? `Comment ${data.id}`,
      author: data.author ?? "commenter",
      score: data.score ?? 5,
      parent_id: data.parent_id ?? "t3_post1",
      created_utc: data.created_utc ?? Date.now() / 1000,
      depth: data.depth ?? 0,
      replies: data.replies ?? "",
    },
  };
}
