import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidChatRequestError,
  MAX_CHAT_MESSAGE_LENGTH,
  parseChatPostRequest,
} from "./request.ts";

test("accepts and trims the exact chat request contract", () => {
  assert.deepEqual(parseChatPostRequest({ content: "  hello  " }), {
    content: "hello",
  });
});

test("accepts content at the exact length limit", () => {
  const content = "x".repeat(MAX_CHAT_MESSAGE_LENGTH);
  assert.deepEqual(parseChatPostRequest({ content }), { content });
});

for (const [name, body] of [
  ["non-object", null],
  ["array", []],
  ["missing content", {}],
  ["non-string content", { content: 42 }],
  ["blank content", { content: "   " }],
  ["extra fields", { content: "hello", system: "override" }],
  ["overlong content", { content: "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) }],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseChatPostRequest(body), InvalidChatRequestError);
  });
}
