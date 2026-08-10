import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MEMORY_DESCRIPTION_LENGTH,
  MAX_MEMORY_TITLE_LENGTH,
} from "../types/memory.ts";
import {
  InvalidMemoryRequestError,
  parseMemoryUpdateRequest,
} from "./request.ts";

test("accepts and normalizes the exact memory update contract", () => {
  assert.deepEqual(
    parseMemoryUpdateRequest({
      title: "  Morning filming  ",
      description: "  Sebastián prefers filming before noon.  ",
      category: "preference",
      importance: "high",
      confidence: "high",
      status: "active",
    }),
    {
      title: "Morning filming",
      description: "Sebastián prefers filming before noon.",
      category: "preference",
      importance: "high",
      confidence: "high",
      status: "active",
    },
  );
});

test("accepts memory text at the exact shared extraction boundaries", () => {
  const input = parseMemoryUpdateRequest({
    title: "t".repeat(MAX_MEMORY_TITLE_LENGTH),
    description: "d".repeat(MAX_MEMORY_DESCRIPTION_LENGTH),
  });
  assert.equal(input.title?.length, MAX_MEMORY_TITLE_LENGTH);
  assert.equal(input.description?.length, MAX_MEMORY_DESCRIPTION_LENGTH);
});

test("rejects invalid values instead of silently ignoring them", () => {
  for (const value of [
    null,
    [],
    {},
    { title: " " },
    { description: null },
    { category: "biography" },
    { importance: "urgent" },
    { confidence: false },
    { status: "deleted" },
    { userId: "someone-else" },
    { sourceMessageId: "message-id" },
  ]) {
    assert.throws(() => parseMemoryUpdateRequest(value), InvalidMemoryRequestError);
  }
});

test("rejects memory text above the shared extraction boundaries", () => {
  assert.throws(
    () => parseMemoryUpdateRequest({ title: "t".repeat(MAX_MEMORY_TITLE_LENGTH + 1) }),
    InvalidMemoryRequestError,
  );
  assert.throws(
    () =>
      parseMemoryUpdateRequest({
        description: "d".repeat(MAX_MEMORY_DESCRIPTION_LENGTH + 1),
      }),
    InvalidMemoryRequestError,
  );
});
