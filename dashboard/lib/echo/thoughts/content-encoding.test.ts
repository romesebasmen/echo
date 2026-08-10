import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeThoughtContent,
  encodeThoughtContent,
} from "./content-encoding.ts";

test("round-trips plain content through the versioned envelope", () => {
  const encoded = encodeThoughtContent("A plain thought", {});

  assert.match(encoded, /^\[\[echo-thought:v2\]\]/);
  assert.deepEqual(decodeThoughtContent(encoded), {
    content: "A plain thought",
  });
});

test("round-trips content and metadata containing legacy marker text", () => {
  const content = "Opening\n\n[[echo-meta]]{\"context\":\"not metadata\"}";
  const context = "A context with\n\n[[echo-meta]] inside";
  const encoded = encodeThoughtContent(content, {
    context,
    possibleFormat: "Talking head",
  });

  assert.deepEqual(decodeThoughtContent(encoded), {
    content,
    context,
    possibleFormat: "Talking head",
  });
});

test("continues decoding legacy metadata rows", () => {
  const legacy =
    'Original thought\n\n[[echo-meta]]{"context":"On the train","possibleFormat":"Story"}';

  assert.deepEqual(decodeThoughtContent(legacy), {
    content: "Original thought",
    context: "On the train",
    possibleFormat: "Story",
  });
});

test("uses the final marker when legacy content itself contains the marker", () => {
  const legacy =
    'Keep\n\n[[echo-meta]] visible\n\n[[echo-meta]]{"context":"Actual metadata"}';

  assert.deepEqual(decodeThoughtContent(legacy), {
    content: "Keep\n\n[[echo-meta]] visible",
    context: "Actual metadata",
    possibleFormat: undefined,
  });
});

test("malformed or extra-field envelopes remain visible as raw content", () => {
  const malformed = "[[echo-thought:v2]]not-json";
  const extraField =
    '[[echo-thought:v2]]{"content":"hidden","unexpected":"value"}';

  assert.deepEqual(decodeThoughtContent(malformed), { content: malformed });
  assert.deepEqual(decodeThoughtContent(extraField), { content: extraField });
});

test("legacy marker text without a valid metadata contract remains raw", () => {
  const raw = 'Thought\n\n[[echo-meta]]{"context":42}';
  assert.deepEqual(decodeThoughtContent(raw), { content: raw });
});
