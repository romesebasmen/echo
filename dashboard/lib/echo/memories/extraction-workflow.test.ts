import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemoryOperation } from "../ai/claude-memory-extraction.ts";
import { createMemoryExtractionWorkflow } from "./extraction-workflow.ts";

const input = {
  userMessage: "I prefer filming before noon.",
  echoReply: "I'll keep mornings in mind.",
  sourceMessageId: "11111111-1111-4111-8111-111111111111",
};

const operation: MemoryOperation = {
  action: "create",
  targetMemoryId: null,
  category: "preference",
  title: "Filming time",
  description: "Sebastián prefers filming before noon.",
  importance: "medium",
  confidence: "high",
};

test("completed chat extraction skips context loading, provider work, and persistence", async () => {
  const events: string[] = [];
  const workflow = createMemoryExtractionWorkflow({
    async runExclusive(operationKey, work) {
      events.push(`lease:${operationKey}`);
      return work();
    },
    async hasCompleted() {
      events.push("completed-check");
      return true;
    },
    async listActiveMemories() {
      events.push("list");
      return [];
    },
    async extract() {
      events.push("provider");
      return [];
    },
    async applyAtomically() {
      events.push("persist");
      return 0;
    },
  });

  assert.equal(await workflow(input), 0);
  assert.deepEqual(events, [
    `lease:memory-extraction:${input.sourceMessageId}`,
    "completed-check",
  ]);
});

test("new extraction runs in order and persists the validated batch once", async () => {
  const events: string[] = [];
  let persisted: { sourceMessageId: string; operations: readonly MemoryOperation[] } | null =
    null;
  const existing = [
    {
      id: "memory-1",
      category: "project" as const,
      title: "Series",
      description: "Sebastián is building a series.",
    },
  ];
  const workflow = createMemoryExtractionWorkflow({
    async runExclusive(_operationKey, work) {
      events.push("lease");
      return work();
    },
    async hasCompleted() {
      events.push("completed-check");
      return false;
    },
    async listActiveMemories() {
      events.push("list");
      return existing;
    },
    async extract(providerInput) {
      events.push("provider");
      assert.deepEqual(providerInput.existingMemories, existing);
      return [operation];
    },
    async applyAtomically(sourceMessageId, operations) {
      events.push("persist");
      persisted = { sourceMessageId, operations };
      return operations.length;
    },
  });

  assert.equal(await workflow(input), 1);
  assert.deepEqual(events, ["lease", "completed-check", "list", "provider", "persist"]);
  assert.deepEqual(persisted, {
    sourceMessageId: input.sourceMessageId,
    operations: [operation],
  });
});

test("provider failure never reaches persistence", async () => {
  const failure = new Error("simulated provider failure");
  let persistenceCalls = 0;
  const workflow = createMemoryExtractionWorkflow({
    async runExclusive(_operationKey, work) {
      return work();
    },
    async hasCompleted() {
      return false;
    },
    async listActiveMemories() {
      return [];
    },
    async extract() {
      throw failure;
    },
    async applyAtomically() {
      persistenceCalls += 1;
      return 0;
    },
  });

  await assert.rejects(() => workflow(input), (error: unknown) => error === failure);
  assert.equal(persistenceCalls, 0);
});
