import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRIEFING_MAX_RETRIES,
  createAnthropicBriefingClient,
} from "./claude-briefing.ts";
import {
  createAnthropicMemoryExtractionClient,
  createMemoryOperationsExtractor,
  MEMORY_EXTRACTION_MAX_RETRIES,
} from "./claude-memory-extraction.ts";
import {
  createAnthropicTikTokPackageClient,
  TIKTOK_PACKAGE_MAX_RETRIES,
} from "./claude-tiktok-package.ts";

const TEST_API_KEY = "test-key-never-sent";

test("all legacy Anthropic clients disable SDK retries", () => {
  const clients = [
    [createAnthropicBriefingClient(TEST_API_KEY), BRIEFING_MAX_RETRIES],
    [
      createAnthropicMemoryExtractionClient(TEST_API_KEY),
      MEMORY_EXTRACTION_MAX_RETRIES,
    ],
    [createAnthropicTikTokPackageClient(TEST_API_KEY), TIKTOK_PACKAGE_MAX_RETRIES],
  ] as const;

  for (const [client, configuredRetries] of clients) {
    assert.equal(configuredRetries, 0);
    assert.equal(client.maxRetries, 0);
  }
});

test("memory extraction performs exactly one provider attempt on failure", async () => {
  let calls = 0;
  const expectedError = new Error("simulated provider failure");
  const extract = createMemoryOperationsExtractor(async () => {
    calls += 1;
    throw expectedError;
  });

  await assert.rejects(
    () =>
      extract({
        userMessage: "I prefer filming early.",
        echoReply: "I'll keep that in mind.",
        existingMemories: [],
      }),
    (error: unknown) => error === expectedError,
  );
  assert.equal(calls, 1);
});
