export interface RedditPost {
  id: string;
  title: string;
  url: string;
  subreddit: string;
  upvotes: number;
  numComments: number;
  selftext: string;
  author: string;
  createdUtc: number;
}

export interface RedditComment {
  id: string;
  postId: string;
  parentId: string;
  body: string;
  author: string;
  upvotes: number;
  depth: number;
  createdUtc: number;
  parentChain: RedditComment[];
}

export interface CommentTree {
  post: RedditPost;
  comments: RedditComment[];
}
