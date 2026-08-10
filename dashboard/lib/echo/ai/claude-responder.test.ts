import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CHAT_MAX_RETRIES,
  CHAT_MODEL,
  ChatProviderUnavailableError,
  createAnthropicChatClient,
  createClaudeResponder,
  InvalidChatProviderResponseError,
  type ClaudeChatMessageCaller,
} from "./claude-responder.ts";
import type { ChatMessage, Memory } from "../types/index.ts";

const history: ChatMessage[] = [
  {
    id: "message-1",
    conversationId: "conversation-1",
    role: "echo",
    content: "What are you thinking about?",
    createdAt: "2026-08-09T15:00:00.000Z",
  },
];

const memories: Memory[] = [];

test("production chat client disables Anthropic SDK retries", () => {
  const client = createAnthropicChatClient("test-api-key");

  assert.equal(CHAT_MAX_RETRIES, 0);
  assert.equal(client.maxRetries, 0);
});

test("chat responder makes exactly one model request and returns text", async () => {
  let calls = 0;
  const captured: Parameters<ClaudeChatMessageCaller>[0][] = [];
  const respond = createClaudeResponder(async (params) => {
    calls += 1;
    captured.push(params);
    return { content: [{ type: "text", text: "Start with the smallest version." }] };
  });

  const result = await respond(history, "I have a video idea.", memories);

  assert.equal(result, "Start with the smallest version.");
  assert.equal(calls, 1);
  const request = captured[0];
  assert.ok(request);
  assert.equal(request.model, CHAT_MODEL);
  assert.equal(request.messages.length, 2);
  assert.deepEqual(request.messages.map((message) => message.role), [
    "assistant",
    "user",
  ]);
});

test("chat provider failures are explicit and are not retried", async () => {
  const cause = new Error("provider offline");
  let calls = 0;
  const respond = createClaudeResponder(async () => {
    calls += 1;
    throw cause;
  });

  await assert.rejects(
    () => respond(history, "Hello", memories),
    (error: unknown) =>
      error instanceof ChatProviderUnavailableError && error.cause === cause,
  );
  assert.equal(calls, 1);
});

test("a response without text is rejected instead of fabricating a reply", async () => {
  const respond = createClaudeResponder(async () => ({
    content: [{ type: "tool_use" }],
  }));

  await assert.rejects(
    () => respond(history, "Hello", memories),
    InvalidChatProviderResponseError,
  );
});

test("production chat route has no mock-response fallback", async () => {
  const routeSource = await readFile(
    new URL("../../../app/api/chat/route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(routeSource, /mock-responder|getMockEchoReply|falling back to mock/i);
  assert.match(routeSource, /status:\s*502/);
});
