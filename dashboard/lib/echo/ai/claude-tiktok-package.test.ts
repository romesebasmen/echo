import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidGeneratedPackageError,
  isValidCreativeWorkPackage,
  parseCreativeWorkPackage,
  TIKTOK_PACKAGE_LIMITS,
} from "./claude-tiktok-package.ts";

function validPackage(): Record<string, unknown> {
  return {
    title: "A useful title",
    hook: "Wait—this is why your plan keeps failing.",
    concept: "A concise explanation of capacity-aware planning.",
    beats: ["Open with the failed plan", "Show the check-in", "Reveal the adjusted plan"],
    caption: "Build the day you can actually finish.",
    hashtags: ["#planning", "#productivity"],
    shotList: ["Talking head", "Screen recording"],
    editingNotes: ["Cut quickly after the hook"],
    estimatedSeconds: 45,
    whyItFits: "It turns a real Echo product principle into a concrete story.",
  };
}

test("accepts, normalizes, and returns the exact package contract", () => {
  const value = validPackage();
  value.title = "  A useful title  ";
  value.beats = ["  First beat  "];

  assert.deepEqual(parseCreativeWorkPackage(value), {
    ...validPackage(),
    title: "A useful title",
    beats: ["First beat"],
  });
  assert.equal(isValidCreativeWorkPackage(value), true);
});

test("rejects extra or missing fields rather than ignoring them", () => {
  const extra = { ...validPackage(), score: 99 };
  const missing = validPackage();
  delete missing.hook;

  assert.throws(() => parseCreativeWorkPackage(extra), InvalidGeneratedPackageError);
  assert.throws(() => parseCreativeWorkPackage(missing), InvalidGeneratedPackageError);
  assert.equal(isValidCreativeWorkPackage(extra), false);
});

test("enforces every scalar text boundary", () => {
  for (const [field, maximum] of [
    ["title", TIKTOK_PACKAGE_LIMITS.title],
    ["hook", TIKTOK_PACKAGE_LIMITS.hook],
    ["concept", TIKTOK_PACKAGE_LIMITS.concept],
    ["caption", TIKTOK_PACKAGE_LIMITS.caption],
    ["whyItFits", TIKTOK_PACKAGE_LIMITS.whyItFits],
  ] as const) {
    const atLimit = validPackage();
    atLimit[field] = "x".repeat(maximum);
    assert.equal(isValidCreativeWorkPackage(atLimit), true, `${field} at limit`);

    const overLimit = validPackage();
    overLimit[field] = "x".repeat(maximum + 1);
    assert.equal(isValidCreativeWorkPackage(overLimit), false, `${field} over limit`);
  }
});

test("enforces array counts, item types, and item lengths", () => {
  for (const [field, maximumItems, maximumItemLength] of [
    ["beats", TIKTOK_PACKAGE_LIMITS.beats, TIKTOK_PACKAGE_LIMITS.listItem],
    ["hashtags", TIKTOK_PACKAGE_LIMITS.hashtags, TIKTOK_PACKAGE_LIMITS.hashtag],
    ["shotList", TIKTOK_PACKAGE_LIMITS.shotList, TIKTOK_PACKAGE_LIMITS.listItem],
    ["editingNotes", TIKTOK_PACKAGE_LIMITS.editingNotes, TIKTOK_PACKAGE_LIMITS.listItem],
  ] as const) {
    for (const invalid of [
      [],
      Array.from({ length: maximumItems + 1 }, () => "item"),
      ["x".repeat(maximumItemLength + 1)],
      ["valid", 42],
    ]) {
      const value = validPackage();
      value[field] = invalid;
      assert.equal(isValidCreativeWorkPackage(value), false, `${field} rejected invalid array`);
    }
  }
});

test("estimatedSeconds must be a bounded positive integer", () => {
  for (const estimatedSeconds of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    TIKTOK_PACKAGE_LIMITS.estimatedSeconds + 1,
  ]) {
    const value = validPackage();
    value.estimatedSeconds = estimatedSeconds;
    assert.equal(isValidCreativeWorkPackage(value), false);
  }

  const maximum = validPackage();
  maximum.estimatedSeconds = TIKTOK_PACKAGE_LIMITS.estimatedSeconds;
  assert.equal(isValidCreativeWorkPackage(maximum), true);
});

test("rejects non-objects and blank package content", () => {
  for (const value of [null, [], "package", { ...validPackage(), title: "   " }]) {
    assert.throws(() => parseCreativeWorkPackage(value), InvalidGeneratedPackageError);
  }
});
