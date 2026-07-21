import Anthropic from "@anthropic-ai/sdk";
import { ECHO_SYSTEM_PROMPT } from "@/lib/echo/ai/system-prompt";
import type { ChatMessage } from "@/lib/echo/types";

// SERVER-ONLY. Import this only from Route Handlers (app/api/**/route.ts).
// ANTHROPIC_API_KEY is read here and must never reach the browser bundle.

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export async function getClaudeReply(
  recentHistory: ChatMessage[],
  newUserMessage: string,
): Promise<string> {
  const client = getClient();

  const history: Anthropic.MessageParam[] = recentHistory.map((message) => ({
    role: message.role === "echo" ? "assistant" : "user",
    content: message.content,
  }));

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: ECHO_SYSTEM_PROMPT,
    messages: [...history, { role: "user", content: newUserMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude response contained no text content.");
  }

  return textBlock.text;
}
