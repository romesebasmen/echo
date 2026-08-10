import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidMemoryExtractionResponseError,
  MAX_MEMORY_DESCRIPTION_LENGTH,
  MAX_MEMORY_OPERATIONS_PER_EXTRACTION,
  MAX_MEMORY_TITLE_LENGTH,
  validateMemoryOperations,
} from "./claude-memory-extraction.ts";

const existingMemories = [
  {
    id: "memory-1",
    category: "preference" as const,
    title: "Filming time",
    description: "Sebastián prefers filming in the morning.",
  },
  {
    id: "memory-2",
    category: "project" as const,
    title: "Weekly series",
    description: "Sebastián is developing a weekly series.",
  },
];

function operation(overrides: Record<string, unknown> = {}) {
  return {
    action: "create",
    targetMemoryId: null,
    category: "preference",
    title: "Editing preference",
    description: "Sebastián prefers concise edits.",
    importance: "medium",
    confidence: "high",
    ...overrides,
  };
}

test("accepts and normalizes valid create, update, and supersede operations", () => {
  const result = validateMemoryOperations(
    {
      operations: [
        operation({ title: "  Editing preference  " }),
        operation({
          action: "update",
          targetMemoryId: "memory-1",
          title: "Filming time",
        }),
        operation({
          action: "supersede",
          targetMemoryId: "memory-2",
          category: "project",
          title: "New weekly series",
        }),
      ],
    },
    existingMemories,
  );

  assert.equal(result.length, 3);
  assert.equal(result[0].title, "Editing preference");
  assert.equal(result[1].targetMemoryId, "memory-1");
  assert.equal(result[2].action, "supersede");
});

test("rejects an unknown or stale update target", () => {
  assert.throws(
    () =>
      validateMemoryOperations(
        {
          operations: [
            operation({ action: "update", targetMemoryId: "unknown-memory" }),
          ],
        },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
});

test("rejects targeting the same active memory more than once", () => {
  assert.throws(
    () =>
      validateMemoryOperations(
        {
          operations: [
            operation({ action: "update", targetMemoryId: "memory-1" }),
            operation({ action: "supersede", targetMemoryId: "memory-1" }),
          ],
        },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
});

test("rejects a create operation with a target ID", () => {
  assert.throws(
    () =>
      validateMemoryOperations(
        { operations: [operation({ targetMemoryId: "memory-1" })] },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
});

test("rejects extra response and operation fields", () => {
  assert.throws(
    () =>
      validateMemoryOperations(
        { operations: [], explanation: "extra" },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
  assert.throws(
    () =>
      validateMemoryOperations(
        { operations: [operation({ score: 10 })] },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
});

test("rejects the entire response when any operation is invalid", () => {
  assert.throws(
    () =>
      validateMemoryOperations(
        {
          operations: [
            operation(),
            operation({ importance: "urgent", title: "Invalid operation" }),
          ],
        },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
});

test("enforces operation count and text length bounds", () => {
  assert.throws(
    () =>
      validateMemoryOperations(
        {
          operations: Array.from(
            { length: MAX_MEMORY_OPERATIONS_PER_EXTRACTION + 1 },
            (_, index) => operation({ title: `Memory ${index}` }),
          ),
        },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
  assert.throws(
    () =>
      validateMemoryOperations(
        { operations: [operation({ title: "x".repeat(MAX_MEMORY_TITLE_LENGTH + 1) })] },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
  assert.throws(
    () =>
      validateMemoryOperations(
        {
          operations: [
            operation({
              description: "x".repeat(MAX_MEMORY_DESCRIPTION_LENGTH + 1),
            }),
          ],
        },
        existingMemories,
      ),
    InvalidMemoryExtractionResponseError,
  );
});
