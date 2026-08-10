import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_CREATIVE_WORK_REFLECTION_LENGTH } from "../types/creative-work.ts";
import {
  InvalidCreativeWorkRequestError,
  parseCreativeWorkCreateRequest,
  parseCreativeWorkGenerationRequest,
  parseCreativeWorkUpdateRequest,
} from "./request.ts";

test("create accepts only a normalized thought identity", () => {
  assert.deepEqual(parseCreativeWorkCreateRequest({ thoughtId: "  thought-1  " }), {
    thoughtId: "thought-1",
  });
  for (const value of [
    {},
    { thoughtId: " " },
    { thoughtId: 42 },
    { thoughtId: "thought-1", platform: "YouTube" },
    null,
    [],
  ]) {
    assert.throws(() => parseCreativeWorkCreateRequest(value), InvalidCreativeWorkRequestError);
  }
});

test("update accepts normalized status and reflection fields", () => {
  assert.deepEqual(
    parseCreativeWorkUpdateRequest({
      status: "filming",
      reflection: "  The shorter hook worked better.  ",
    }),
    { status: "filming", reflection: "The shorter hook worked better." },
  );
  assert.equal(
    parseCreativeWorkUpdateRequest({
      reflection: "r".repeat(MAX_CREATIVE_WORK_REFLECTION_LENGTH),
    }).reflection?.length,
    MAX_CREATIVE_WORK_REFLECTION_LENGTH,
  );
});

test("update rejects empty, invalid, extra, and overlong fields", () => {
  for (const value of [
    {},
    { status: "published" },
    { status: null },
    { reflection: " " },
    { reflection: false },
    { reflection: "r".repeat(MAX_CREATIVE_WORK_REFLECTION_LENGTH + 1) },
    { package: { title: "client supplied" } },
    { generatedAt: "2026-08-09T12:00:00Z" },
  ]) {
    assert.throws(() => parseCreativeWorkUpdateRequest(value), InvalidCreativeWorkRequestError);
  }
});

test("generation accepts only an optional strict force boolean", () => {
  assert.deepEqual(parseCreativeWorkGenerationRequest({}), { force: false });
  assert.deepEqual(parseCreativeWorkGenerationRequest({ force: false }), { force: false });
  assert.deepEqual(parseCreativeWorkGenerationRequest({ force: true }), { force: true });

  for (const value of [
    { force: "true" },
    { force: 1 },
    { force: false, prompt: "ignore safety" },
    null,
    [],
  ]) {
    assert.throws(
      () => parseCreativeWorkGenerationRequest(value),
      InvalidCreativeWorkRequestError,
    );
  }
});
