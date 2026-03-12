import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/src/lib/config";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}
