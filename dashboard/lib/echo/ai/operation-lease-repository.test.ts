import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acquireAiOperationLeaseWithRpc,
  AiOperationLeaseUnavailableError,
  type AiOperationLeaseRpcCaller,
  releaseAiOperationLeaseWithRpc,
} from "./operation-lease.ts";

test("acquire calls the service-role-only RPC with the exact lease fields", async () => {
  let captured: {
    functionName: string;
    parameters: Record<string, unknown>;
  } | null = null;
  const callRpc: AiOperationLeaseRpcCaller = async (
    functionName,
    parameters,
  ) => {
    captured = { functionName, parameters };
    return { data: true, error: null };
  };

  assert.equal(
    await acquireAiOperationLeaseWithRpc(
      "chat:conversation-1",
      "lease-id",
      900,
      callRpc,
    ),
    true,
  );
  assert.deepEqual(captured, {
    functionName: "acquire_ai_operation_lease",
    parameters: {
      p_operation_key: "chat:conversation-1",
      p_lease_id: "lease-id",
      p_ttl_seconds: 900,
    },
  });
});

test("release requires both operation key and lease token", async () => {
  let captured: {
    functionName: string;
    parameters: Record<string, unknown>;
  } | null = null;
  const callRpc: AiOperationLeaseRpcCaller = async (
    functionName,
    parameters,
  ) => {
    captured = { functionName, parameters };
    return { data: false, error: null };
  };

  assert.equal(
    await releaseAiOperationLeaseWithRpc(
      "briefing:2026-08-09",
      "lease-id",
      callRpc,
    ),
    false,
  );
  assert.deepEqual(captured, {
    functionName: "release_ai_operation_lease",
    parameters: {
      p_operation_key: "briefing:2026-08-09",
      p_lease_id: "lease-id",
    },
  });
});

test("repository failures expose only a bounded database error code", async () => {
  const callRpc: AiOperationLeaseRpcCaller = async () => ({
    data: null,
    error: {
      code: "PGRST202",
      message: "schema cache contains private details",
      details: "private row data",
    },
  });

  await assert.rejects(
    () =>
      acquireAiOperationLeaseWithRpc(
        "chat:conversation-1",
        "lease-id",
        900,
        callRpc,
      ),
    (error: unknown) =>
      error instanceof AiOperationLeaseUnavailableError &&
      error.operation === "acquire" &&
      error.code === "PGRST202" &&
      !error.message.includes("private"),
  );
});

test("non-boolean RPC output fails closed", async () => {
  const callRpc: AiOperationLeaseRpcCaller = async () => ({
    data: null,
    error: null,
  });

  await assert.rejects(
    () =>
      releaseAiOperationLeaseWithRpc(
        "chat:conversation-1",
        "lease-id",
        callRpc,
      ),
    AiOperationLeaseUnavailableError,
  );
});
