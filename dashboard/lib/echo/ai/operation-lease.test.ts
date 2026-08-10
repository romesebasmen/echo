import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  AI_OPERATION_LEASE_TTL_SECONDS,
  AiOperationInProgressError,
  AiOperationLeaseUnavailableError,
  createAiOperationKey,
  createAiOperationLeaseRunner,
} from "./operation-lease.ts";

test("creates bounded, non-sensitive operation keys for every provider scope", () => {
  assert.equal(
    createAiOperationKey("chat", "conversation-1"),
    "chat:conversation-1",
  );
  assert.equal(
    createAiOperationKey("briefing", "2026-08-09"),
    "briefing:2026-08-09",
  );
  assert.equal(
    createAiOperationKey("memory-extraction", "message-1"),
    "memory-extraction:message-1",
  );
  assert.throws(
    () => createAiOperationKey("tiktok-package", "contains private text"),
    AiOperationLeaseUnavailableError,
  );
});

test("acquires before work and releases the exact token after success", async () => {
  const events: string[] = [];
  const run = createAiOperationLeaseRunner({
    async acquire(operationKey, leaseId, ttlSeconds) {
      events.push(`acquire:${operationKey}:${leaseId}:${ttlSeconds}`);
      return true;
    },
    async release(operationKey, leaseId) {
      events.push(`release:${operationKey}:${leaseId}`);
      return true;
    },
    createLeaseId: () => "lease-1",
  });

  const result = await run("chat:conversation-1", async () => {
    events.push("provider");
    return "reply";
  });

  assert.equal(result, "reply");
  assert.deepEqual(events, [
    `acquire:chat:conversation-1:lease-1:${AI_OPERATION_LEASE_TTL_SECONDS}`,
    "provider",
    "release:chat:conversation-1:lease-1",
  ]);
});

test("a held lease rejects duplicate work before the provider callback", async () => {
  let providerCalls = 0;
  const run = createAiOperationLeaseRunner({
    async acquire() {
      return false;
    },
    async release() {
      throw new Error("must not release an unacquired lease");
    },
    createLeaseId: () => "lease-2",
  });

  await assert.rejects(
    () =>
      run("day-plan-regeneration:2026-08-09", async () => {
        providerCalls += 1;
      }),
    AiOperationInProgressError,
  );
  assert.equal(providerCalls, 0);
});

test("provider failure releases the lease and preserves the original failure", async () => {
  const upstream = new Error("provider failed");
  let releases = 0;
  const run = createAiOperationLeaseRunner({
    async acquire() {
      return true;
    },
    async release() {
      releases += 1;
      return true;
    },
    createLeaseId: () => "lease-3",
  });

  await assert.rejects(
    () => run("briefing:2026-08-09", async () => Promise.reject(upstream)),
    (error: unknown) => error === upstream,
  );
  assert.equal(releases, 1);
});

test("release failure is reported safely without discarding successful work", async () => {
  const reported: AiOperationLeaseUnavailableError[] = [];
  const run = createAiOperationLeaseRunner({
    async acquire() {
      return true;
    },
    async release() {
      throw new Error("raw database details");
    },
    createLeaseId: () => "lease-4",
    reportReleaseError(error) {
      reported.push(error);
    },
  });

  assert.equal(
    await run("tiktok-package:work-1", async () => "package"),
    "package",
  );
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.operation, "release");
  assert.doesNotMatch(reported[0]?.message ?? "", /raw database details/);
});

test("acquisition failures fail closed before paid work", async () => {
  let providerCalls = 0;
  const run = createAiOperationLeaseRunner({
    async acquire() {
      throw new Error("database unavailable");
    },
    async release() {
      return true;
    },
    createLeaseId: () => "lease-5",
  });

  await assert.rejects(
    () =>
      run("chat:conversation-1", async () => {
        providerCalls += 1;
      }),
    AiOperationLeaseUnavailableError,
  );
  assert.equal(providerCalls, 0);
});

test("every user-triggered paid generation entry point uses the durable lease", () => {
  for (const relativePath of [
    "../../../app/api/chat/route.ts",
    "../../../app/api/creative-works/[id]/generate/route.ts",
    "../daily-briefing/generator.ts",
    "../day-plan/regeneration-route-service.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /runWithAiOperationLease/, relativePath);
    assert.match(source, /createAiOperationKey/, relativePath);
  }

  const extractionService = readFileSync(
    new URL("../memories/extraction-service.ts", import.meta.url),
    "utf8",
  );
  const extractionWorkflow = readFileSync(
    new URL("../memories/extraction-workflow.ts", import.meta.url),
    "utf8",
  );
  assert.match(extractionService, /runWithAiOperationLease/);
  assert.match(extractionWorkflow, /createAiOperationKey\("memory-extraction"/);
});
