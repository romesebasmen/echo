import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemoryOperation } from "../ai/claude-memory-extraction.ts";
import {
  applyMemoryOperationsAtomically,
  MemoryExtractionPersistenceError,
  type MemoryExtractionRpcCaller,
} from "./extraction-repository.ts";

const operations: MemoryOperation[] = [
  {
    action: "create",
    targetMemoryId: null,
    category: "preference",
    title: "Filming time",
    description: "Sebastián prefers filming before noon.",
    importance: "medium",
    confidence: "high",
  },
];

test("atomic persistence sends only the source message and validated operations", async () => {
  let captured: { name: string; parameters: Record<string, unknown> } | null = null;
  const callRpc: MemoryExtractionRpcCaller = async (name, parameters) => {
    captured = { name, parameters };
    return { data: 1, error: null };
  };

  assert.equal(
    await applyMemoryOperationsAtomically("message-1", operations, callRpc),
    1,
  );
  assert.deepEqual(captured, {
    name: "apply_memory_extraction",
    parameters: {
      p_source_message_id: "message-1",
      p_operations: operations,
    },
  });
});

test("database failures are mapped without exposing details", async () => {
  const callRpc: MemoryExtractionRpcCaller = async () => ({
    data: null,
    error: { code: "PGRST202" },
  });

  await assert.rejects(
    () => applyMemoryOperationsAtomically("message-1", operations, callRpc),
    (error: unknown) =>
      error instanceof MemoryExtractionPersistenceError &&
      error.code === "PGRST202",
  );
});

test("invalid RPC output fails closed", async () => {
  const callRpc: MemoryExtractionRpcCaller = async () => ({
    data: 11,
    error: null,
  });

  await assert.rejects(
    () => applyMemoryOperationsAtomically("message-1", operations, callRpc),
    MemoryExtractionPersistenceError,
  );
});
