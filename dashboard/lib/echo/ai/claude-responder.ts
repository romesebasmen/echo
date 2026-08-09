import Anthropic from "@anthropic-ai/sdk";
import { ECHO_SYSTEM_PROMPT } from "./system-prompt.ts";
import type { ChatMessage, Memory } from "../types/index.ts";

// SERVER-ONLY. Import this only from Route Handlers (app/api/**/route.ts).
// ANTHROPIC_API_KEY is read here and must never reach the browser bundle.

export const CHAT_MODEL = "claude-opus-4-8";
export const CHAT_MAX_RETRIES = 0;

export class ChatProviderUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The Echo chat provider is unavailable.");
    this.name = "ChatProviderUnavailableError";
    this.cause = cause;
  }
}

export class InvalidChatProviderResponseError extends Error {
  constructor() {
    super("The Echo chat provider returned no text content.");
    this.name = "InvalidChatProviderResponseError";
  }
}

export type ClaudeChatMessageCaller = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<{ content: readonly { type: string; text?: string }[] }>;

function formatMemoriesForPrompt(memories: Memory[]): string {
  if (memories.length === 0) {
    return "(no stored memories yet)";
  }

  return memories
    .map(
      (memory) =>
        `- [${memory.category}, ${memory.importance} importance, ${memory.confidence} confidence] ${memory.title}: ${memory.description}`,
    )
    .join("\n");
}

let cachedClient: Anthropic | null = null;

export function createAnthropicChatClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: CHAT_MAX_RETRIES });
}

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = createAnthropicChatClient(apiKey);
  return cachedClient;
}

export function createClaudeResponder(callModel: ClaudeChatMessageCaller) {
  return async function respond(
    recentHistory: ChatMessage[],
    newUserMessage: string,
    relevantMemories: Memory[],
  ): Promise<string> {
    const history: Anthropic.MessageParam[] = recentHistory.map((message) => ({
      role: message.role === "echo" ? "assistant" : "user",
      content: message.content,
    }));

    const system = `${ECHO_SYSTEM_PROMPT}

## What you remember about Sebastián so far
${formatMemoriesForPrompt(relevantMemories)}

Treat this as background, not a script — only bring it up if it's actually relevant to what he just said.`;

    let response: Awaited<ReturnType<ClaudeChatMessageCaller>>;
    try {
      response = await callModel({
        model: CHAT_MODEL,
        max_tokens: 1024,
        system,
        messages: [...history, { role: "user", content: newUserMessage }],
      });
    } catch (error) {
      throw new ChatProviderUnavailableError(error);
    }

    const textBlock = response.content.find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    if (!textBlock?.text) {
      throw new InvalidChatProviderResponseError();
    }

    return textBlock.text;
  };
}

export const getClaudeReply = createClaudeResponder(async (params) => {
  const client = getClient();
  return client.messages.create(params);
});
