import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidThoughtRequestError,
  MAX_THOUGHT_CONTENT_LENGTH,
  MAX_THOUGHT_CONTEXT_LENGTH,
  MAX_THOUGHT_FORMAT_LENGTH,
  parseThoughtWriteRequest,
} from "./request.ts";

test("accepts the exact thought write contract and normalizes whitespace", () => {
  assert.deepEqual(
    parseThoughtWriteRequest({
      content: "  A thought  ",
      context: "  On the train  ",
      possibleFormat: "  Story  ",
    }),
    {
      content: "A thought",
      context: "On the train",
      possibleFormat: "Story",
    },
  );
});

test("normalizes blank optional fields to absence", () => {
  assert.deepEqual(
    parseThoughtWriteRequest({
      content: "A thought",
      context: "   ",
      possibleFormat: "",
    }),
    { content: "A thought" },
  );
});

test("accepts every field at its exact boundary", () => {
  const result = parseThoughtWriteRequest({
    content: "c".repeat(MAX_THOUGHT_CONTENT_LENGTH),
    context: "x".repeat(MAX_THOUGHT_CONTEXT_LENGTH),
    possibleFormat: "f".repeat(MAX_THOUGHT_FORMAT_LENGTH),
  });

  assert.equal(result.content.length, MAX_THOUGHT_CONTENT_LENGTH);
  assert.equal(result.context?.length, MAX_THOUGHT_CONTEXT_LENGTH);
  assert.equal(result.possibleFormat?.length, MAX_THOUGHT_FORMAT_LENGTH);
});

test("rejects missing, blank, and non-string content", () => {
  for (const value of [{}, { content: " " }, { content: 42 }]) {
    assert.throws(
      () => parseThoughtWriteRequest(value),
      InvalidThoughtRequestError,
    );
  }
});

test("rejects overlong prompt-bearing fields", () => {
  for (const value of [
    { content: "c".repeat(MAX_THOUGHT_CONTENT_LENGTH + 1) },
    {
      content: "Thought",
      context: "x".repeat(MAX_THOUGHT_CONTEXT_LENGTH + 1),
    },
    {
      content: "Thought",
      possibleFormat: "f".repeat(MAX_THOUGHT_FORMAT_LENGTH + 1),
    },
  ]) {
    assert.throws(
      () => parseThoughtWriteRequest(value),
      InvalidThoughtRequestError,
    );
  }
});

test("rejects arrays, null, non-string optional fields, and extra fields", () => {
  for (const value of [
    null,
    [],
    { content: "Thought", context: null },
    { content: "Thought", possibleFormat: false },
    { content: "Thought", userId: "someone-else" },
  ]) {
    assert.throws(
      () => parseThoughtWriteRequest(value),
      InvalidThoughtRequestError,
    );
  }
});
