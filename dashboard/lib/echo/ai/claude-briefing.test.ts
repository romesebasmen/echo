import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRIEFING_CONTENT_LIMITS,
  InvalidGeneratedBriefingError,
  parseGeneratedBriefingContent,
} from "./claude-briefing.ts";

function validBriefing(): Record<string, unknown> {
  return {
    greeting: "Good morning, Sebastián.",
    whatChanged: "You captured two thoughts since the last briefing.",
    patternNoticed: {
      text: "Your recent ideas both start from concrete daily friction.",
      kind: "pattern",
    },
    bestRecommendation: "Develop the capacity-aware planning idea first.",
    nextAction: "Write the opening hook.",
  };
}

test("accepts, normalizes, and returns the exact briefing contract", () => {
  const input = validBriefing();
  input.greeting = "  Good morning, Sebastián.  ";
  input.patternNoticed = { text: "  A grounded pattern.  ", kind: "hypothesis" };

  assert.deepEqual(parseGeneratedBriefingContent(input), {
    ...validBriefing(),
    greeting: "Good morning, Sebastián.",
    patternNoticed: { text: "A grounded pattern.", kind: "hypothesis" },
  });
});

test("rejects unknown, missing, and nested extra fields", () => {
  const missing = validBriefing();
  delete missing.nextAction;
  const nestedExtra = validBriefing();
  nestedExtra.patternNoticed = { text: "Pattern", kind: "pattern", confidence: 0.9 };

  for (const value of [
    { ...validBriefing(), score: 10 },
    missing,
    nestedExtra,
    null,
    [],
  ]) {
    assert.throws(() => parseGeneratedBriefingContent(value), InvalidGeneratedBriefingError);
  }
});

test("accepts only the evidence-aware pattern kinds", () => {
  for (const kind of ["fact", "observation", "", null]) {
    const value = validBriefing();
    value.patternNoticed = { text: "A claim", kind };
    assert.throws(() => parseGeneratedBriefingContent(value), InvalidGeneratedBriefingError);
  }
});

test("enforces every briefing text boundary", () => {
  for (const [field, maximum] of [
    ["greeting", BRIEFING_CONTENT_LIMITS.greeting],
    ["whatChanged", BRIEFING_CONTENT_LIMITS.whatChanged],
    ["bestRecommendation", BRIEFING_CONTENT_LIMITS.bestRecommendation],
    ["nextAction", BRIEFING_CONTENT_LIMITS.nextAction],
  ] as const) {
    const atLimit = validBriefing();
    atLimit[field] = "x".repeat(maximum);
    assert.doesNotThrow(() => parseGeneratedBriefingContent(atLimit));

    const overLimit = validBriefing();
    overLimit[field] = "x".repeat(maximum + 1);
    assert.throws(() => parseGeneratedBriefingContent(overLimit), InvalidGeneratedBriefingError);
  }

  const patternAtLimit = validBriefing();
  patternAtLimit.patternNoticed = {
    text: "x".repeat(BRIEFING_CONTENT_LIMITS.patternText),
    kind: "pattern",
  };
  assert.doesNotThrow(() => parseGeneratedBriefingContent(patternAtLimit));

  const patternOverLimit = validBriefing();
  patternOverLimit.patternNoticed = {
    text: "x".repeat(BRIEFING_CONTENT_LIMITS.patternText + 1),
    kind: "pattern",
  };
  assert.throws(
    () => parseGeneratedBriefingContent(patternOverLimit),
    InvalidGeneratedBriefingError,
  );
});

test("rejects blank and non-string briefing content", () => {
  for (const value of [
    { ...validBriefing(), greeting: " " },
    { ...validBriefing(), whatChanged: 42 },
    { ...validBriefing(), bestRecommendation: null },
    { ...validBriefing(), nextAction: [] },
    { ...validBriefing(), patternNoticed: { text: " ", kind: "pattern" } },
  ]) {
    assert.throws(() => parseGeneratedBriefingContent(value), InvalidGeneratedBriefingError);
  }
});
