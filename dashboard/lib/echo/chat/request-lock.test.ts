import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  releaseChatRequestLock,
  tryAcquireChatRequestLock,
} from "./request-lock.ts";

test("serializes requests for the same conversation", () => {
  assert.equal(tryAcquireChatRequestLock("conversation-a"), true);
  assert.equal(tryAcquireChatRequestLock("conversation-a"), false);

  releaseChatRequestLock("conversation-a");
  assert.equal(tryAcquireChatRequestLock("conversation-a"), true);
  releaseChatRequestLock("conversation-a");
});

test("does not block an unrelated conversation", () => {
  assert.equal(tryAcquireChatRequestLock("conversation-a"), true);
  assert.equal(tryAcquireChatRequestLock("conversation-b"), true);

  releaseChatRequestLock("conversation-a");
  releaseChatRequestLock("conversation-b");
});

test("chat route persists the user and Echo messages in one insert after generation", async () => {
  const routeSource = await readFile(
    new URL("../../../app/api/chat/route.ts", import.meta.url),
    "utf8",
  );

  const generationIndex = routeSource.indexOf("await getClaudeReply(");
  const atomicInsertIndex = routeSource.indexOf(".insert([");

  assert.ok(generationIndex >= 0, "route must call the provider");
  assert.ok(atomicInsertIndex > generationIndex, "messages must be inserted after generation");
  assert.doesNotMatch(routeSource, /\.insert\(\{\s*conversation_id:\s*conversationId/);
  assert.match(routeSource, /tryAcquireChatRequestLock/);
  assert.match(routeSource, /releaseChatRequestLock/);
});

test("clearing chat uses the same local and database lease as response generation", async () => {
  const routeSource = await readFile(
    new URL("../../../app/api/chat/route.ts", import.meta.url),
    "utf8",
  );
  const deleteHandler = routeSource.slice(
    routeSource.indexOf("export async function DELETE()"),
  );

  assert.match(deleteHandler, /tryAcquireChatRequestLock\(conversationId\)/);
  assert.match(
    deleteHandler,
    /runWithAiOperationLease\(\s*createAiOperationKey\("chat", conversationId\)/,
  );
  assert.match(deleteHandler, /releaseChatRequestLock\(lockedConversationId\)/);

  const leaseIndex = deleteHandler.indexOf("runWithAiOperationLease(");
  const deleteIndex = deleteHandler.indexOf('.from("messages")');
  assert.ok(leaseIndex >= 0);
  assert.ok(deleteIndex > leaseIndex, "message deletion must happen inside the lease");
});
