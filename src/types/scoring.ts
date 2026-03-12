export type ThreadVerdict = "dive_in" | "skip";
export type CommentVerdict = "reply_worthy" | "interesting" | "skip";

export interface ThreadScore {
  postId: string;
  verdict: ThreadVerdict;
  relevanceScore: number;
  reasoning: string;
  suggestedTopics: string[];
}

export interface CommentScore {
  commentId: string;
  postId: string;
  verdict: CommentVerdict;
  relevanceScore: number;
  reasoning: string;
  replyAngle: string | null;
  urgency: "high" | "medium" | "low";
}

export interface ScoringConfig {
  topicDescription: string;
  replyPersona: string;
  threadThreshold: number;
  commentThreshold: number;
}
