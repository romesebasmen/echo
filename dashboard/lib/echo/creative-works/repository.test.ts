import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CreativeWorkOpportunityPersistenceError,
  CreativeWorkOriginNotFoundError,
  getOrCreateThoughtCreativeWorkWithRpc,
  MissingCreativeWorkOpportunityMigrationError,
  type CreativeWorkRow,
} from "./repository.ts";

const WORK_ID = "550e8400-e29b-41d4-a716-446655440000";
const THOUGHT_ID = "550e8400-e29b-41d4-a716-446655440001";

const row: CreativeWorkRow = {
  id: WORK_ID,
  user_id: "sebastian",
  origin_type: "thought",
  origin_id: THOUGHT_ID,
  platform: "TikTok",
  status: "opportunity",
  package: null,
  reflection: null,
  created_at: "2026-08-10T20:00:00.000Z",
  updated_at: "2026-08-10T20:00:00.000Z",
  generated_at: null,
  posted_at: null,
};

test("atomic opportunity creation sends only source identity and platform", async () => {
  let functionName = "";
  let parameters: Record<string, unknown> = {};

  const result = await getOrCreateThoughtCreativeWorkWithRpc(
    THOUGHT_ID,
    "TikTok",
    async (calledFunction, calledParameters) => {
      functionName = calledFunction;
      parameters = calledParameters;
      return {
        data: { created: true, creative_work: row },
        error: null,
      };
    },
  );

  assert.equal(functionName, "get_or_create_thought_creative_work");
  assert.deepEqual(parameters, {
    p_thought_id: THOUGHT_ID,
    p_platform: "TikTok",
  });
  assert.equal(result.created, true);
  assert.equal(result.creativeWork.id, WORK_ID);
  assert.equal(result.creativeWork.originId, THOUGHT_ID);
});

test("an existing atomic opportunity is returned without claiming a create", async () => {
  const result = await getOrCreateThoughtCreativeWorkWithRpc(
    THOUGHT_ID,
    "TikTok",
    async () => ({
      data: { created: false, creative_work: row },
      error: null,
    }),
  );

  assert.equal(result.created, false);
  assert.equal(result.creativeWork.id, WORK_ID);
});

test("a missing or foreign source thought maps to a typed not-found error", async () => {
  await assert.rejects(
    () =>
      getOrCreateThoughtCreativeWorkWithRpc(
        THOUGHT_ID,
        "TikTok",
        async () => ({
          data: null,
          error: { code: "P0001", message: "ECHO_THOUGHT_NOT_FOUND" },
        }),
      ),
    CreativeWorkOriginNotFoundError,
  );
});

test("a missing RPC maps to an explicit migration error", async () => {
  await assert.rejects(
    () =>
      getOrCreateThoughtCreativeWorkWithRpc(
        THOUGHT_ID,
        "TikTok",
        async () => ({
          data: null,
          error: {
            code: "PGRST202",
            message:
              "Could not find public.get_or_create_thought_creative_work in the schema cache",
          },
        }),
      ),
    MissingCreativeWorkOpportunityMigrationError,
  );
});

test("unexpected database details are not exposed and malformed rows fail closed", async () => {
  await assert.rejects(
    () =>
      getOrCreateThoughtCreativeWorkWithRpc(
        THOUGHT_ID,
        "TikTok",
        async () => ({
          data: null,
          error: {
            code: "unexpected code with details",
            message: "sensitive database detail",
          },
        }),
      ),
    (error: unknown) =>
      error instanceof CreativeWorkOpportunityPersistenceError &&
      error.code === null &&
      !error.message.includes("sensitive"),
  );

  await assert.rejects(
    () =>
      getOrCreateThoughtCreativeWorkWithRpc(
        THOUGHT_ID,
        "TikTok",
        async () => ({
          data: { created: true, creative_work: { id: WORK_ID } },
          error: null,
        }),
      ),
    CreativeWorkOpportunityPersistenceError,
  );
});
