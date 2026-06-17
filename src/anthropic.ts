import Anthropic from "@anthropic-ai/sdk";

const SUMMARY_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;

/** Lazily construct a shared Anthropic client (one per process). */
export function getAnthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Run a single-prompt completion and return the text of the first content block. */
export async function summarize(prompt: string, maxTokens: number): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: SUMMARY_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  return block && block.type === "text" ? block.text : "";
}
