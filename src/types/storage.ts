import type { RedditComment } from "./reddit";

export type QueueItemStatus = "pending" | "replied" | "dismissed" | "snoozed";
export type Urgency = "high" | "medium" | "low";

export interface SavedThread {
  id: string;
  postId: string;
  title: string;
  url: string;
  subreddit: string;
  relevanceScore: number;
  reasoning: string;
  suggestedTopics: string[];
  savedAt: Date;
}

export interface QueueItem {
  id: string;
  threadId: string;
  commentId: string;
  commentBody: string;
  commentUrl: string;
  author: string;
  upvotes: number;
  depth: number;
  relevanceScore: number;
  reasoning: string;
  replyAngle: string | null;
  urgency: Urgency;
  status: QueueItemStatus;
  parentChain: RedditComment[];
  savedAt: Date;
  repliedAt: Date | null;
  notes: string | null;
}

export interface QueueItemWithThread extends QueueItem {
  thread: SavedThread;
}

export interface QueueFilter {
  status?: QueueItemStatus;
  urgency?: Urgency;
  subreddit?: string;
  minScore?: number;
}

export interface ScoutConfigRow {
  subreddits: string[];
  topicDescription: string;
  replyPersona: string;
  threadThreshold: number;
  commentThreshold: number;
  rateLimitMs: number;
  pollIntervalMs: number;
  updatedAt: Date;
}

export interface ScoutConfigInput {
  subreddits: string[];
  topicDescription: string;
  replyPersona: string;
  threadThreshold: number;
  commentThreshold: number;
  rateLimitMs: number;
  pollIntervalMs: number;
}

export interface CrawlRun {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  subreddits: string[];
  threadsScanned: number;
  threadsSaved: number;
  commentsSaved: number;
  errorMessage: string | null;
}
