import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConversationBootstrapPersistenceError,
  getOrCreateConversationIdWithRpc,
  MissingConversationBootstrapMigrationError,
} from "./conversation-store.ts";

const CONVERSATION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("conversation bootstrap delegates to the server-only singleton RPC", async () => {
  let calls = 0;
  const id = await getOrCreateConversationIdWithRpc(
    async (functionName, parameters) => {
      calls += 1;
      assert.equal(functionName, "get_or_create_echo_conversation");
      assert.deepEqual(parameters, {});
      return { data: CONVERSATION_ID, error: null };
    },
  );

  assert.equal(id, CONVERSATION_ID);
  assert.equal(calls, 1);
});

test("conversation bootstrap detects a missing migration explicitly", async () => {
  await assert.rejects(
    () =>
      getOrCreateConversationIdWithRpc(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "get_or_create_echo_conversation was not found",
        },
      })),
    MissingConversationBootstrapMigrationError,
  );
});

test("conversation bootstrap bounds database errors and rejects malformed IDs", async () => {
  await assert.rejects(
    () =>
      getOrCreateConversationIdWithRpc(async () => ({
        data: null,
        error: { code: "42501", message: "private database details" },
      })),
    (error: unknown) =>
      error instanceof ConversationBootstrapPersistenceError &&
      error.code === "42501" &&
      !error.message.includes("private database details"),
  );

  await assert.rejects(
    () =>
      getOrCreateConversationIdWithRpc(async () => ({
        data: "not-a-uuid",
        error: null,
      })),
    ConversationBootstrapPersistenceError,
  );
});
