import type { RedditPost } from "@/src/types/reddit";
import { config } from "@/src/lib/config";
import { redditFetch } from "./client";

interface RedditListingResponse {
  data: {
    children: Array<{
      data: {
        id: string;
        title: string;
        permalink: string;
        subreddit: string;
        score: number;
        num_comments: number;
        selftext: string;
        author: string;
        created_utc: number;
      };
    }>;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchNewPosts(
  subreddits: string[],
  limit?: number
): Promise<RedditPost[]> {
  const postLimit = limit ?? config.pipeline.batchSize;
  const allPosts: RedditPost[] = [];

  for (let i = 0; i < subreddits.length; i++) {
    if (i > 0) {
      await sleep(config.reddit.rateLimitMs);
    }

    const subreddit = subreddits[i]!;
    const listing = await redditFetch<RedditListingResponse>(
      `/r/${subreddit}/new.json?limit=${postLimit}`
    );

    for (const child of listing.data.children) {
      const d = child.data;
      allPosts.push({
        id: d.id,
        title: d.title,
        url: `https://reddit.com${d.permalink}`,
        subreddit: d.subreddit,
        upvotes: d.score,
        numComments: d.num_comments,
        selftext: d.selftext.slice(0, 2000),
        author: d.author,
        createdUtc: d.created_utc,
      });
    }
  }

  return allPosts;
}
