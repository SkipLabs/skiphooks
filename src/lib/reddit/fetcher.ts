import type { CommentTree, RedditComment, RedditPost } from "@/src/types/reddit";
import { config } from "@/src/lib/config";
import { redditFetch } from "./client";

interface RedditCommentData {
  id: string;
  body?: string;
  author: string;
  score: number;
  parent_id: string;
  created_utc: number;
  depth: number;
  replies?: RedditListing | "";
}

interface RedditListing {
  data: {
    children: Array<{
      kind: string;
      data: RedditCommentData;
    }>;
  };
}

interface RedditPostData {
  id: string;
  title: string;
  permalink: string;
  subreddit: string;
  score: number;
  num_comments: number;
  selftext: string;
  author: string;
  created_utc: number;
}

interface RedditPostListing {
  data: {
    children: Array<{
      data: RedditPostData;
    }>;
  };
}

function stripTypePrefix(id: string): string {
  return id.replace(/^t[0-9]_/, "");
}

function flattenComments(
  children: RedditListing["data"]["children"],
  postId: string,
  parentChain: RedditComment[],
  result: RedditComment[],
  max: number
): void {
  for (const child of children) {
    if (result.length >= max) return;
    if (child.kind !== "t1") continue;

    const d = child.data;
    const body = d.body ?? "";

    if (body === "[deleted]" || body === "[removed]") {
      // Still recurse into replies — children may be valid
      if (d.replies && typeof d.replies === "object") {
        flattenComments(d.replies.data.children, postId, parentChain, result, max);
      }
      continue;
    }

    const comment: RedditComment = {
      id: d.id,
      postId,
      parentId: stripTypePrefix(d.parent_id),
      body: body.slice(0, 1000),
      author: d.author,
      upvotes: d.score,
      depth: d.depth,
      createdUtc: d.created_utc,
      parentChain: [...parentChain],
    };

    result.push(comment);

    if (d.replies && typeof d.replies === "object") {
      flattenComments(
        d.replies.data.children,
        postId,
        [...parentChain, comment],
        result,
        max
      );
    }
  }
}

export async function fetchCommentTree(
  postId: string,
  subreddit: string
): Promise<CommentTree> {
  const [postListing, commentListing] = await redditFetch<
    [RedditPostListing, RedditListing]
  >(`/r/${subreddit}/comments/${postId}.json?limit=500&depth=10`);

  const p = postListing.data.children[0]!.data;
  const post: RedditPost = {
    id: p.id,
    title: p.title,
    url: `https://reddit.com${p.permalink}`,
    subreddit: p.subreddit,
    upvotes: p.score,
    numComments: p.num_comments,
    selftext: p.selftext.slice(0, 2000),
    author: p.author,
    createdUtc: p.created_utc,
  };

  const comments: RedditComment[] = [];
  flattenComments(
    commentListing.data.children,
    postId,
    [],
    comments,
    config.pipeline.maxCommentsPerThread
  );

  return { post, comments };
}
