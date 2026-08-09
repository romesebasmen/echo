import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { EngagementSnapshot, EngagementState } from "../types/ui.ts";
import {
  getAvailableEngagementSnapshot,
  getEngagementState,
} from "./engagement.ts";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

test("default engagement service returns not-connected without a snapshot", async () => {
  const state = await getEngagementState();

  assert.deepEqual(state, { status: "not-connected" });
  assert.equal("snapshot" in state, false);
});

test("available engagement requires verified provenance and reaches the metric renderer", () => {
  const snapshot: EngagementSnapshot = {
    since: "the last verified sync",
    metrics: [{ label: "Views", value: 1200 }],
    bestPost: "A verified post",
    bestPlatform: "TikTok",
    insight: "A verified performance insight.",
  };
  const state: EngagementState = {
    status: "available",
    source: {
      connectionId: "connection-1",
      platform: "TikTok",
      verificationStatus: "verified",
      verifiedAt: "2026-08-09T12:00:00.000Z",
    },
    snapshot,
  };

  assert.strictEqual(getAvailableEngagementSnapshot(state), snapshot);
});

test("production engagement flow no longer imports or ships the mock snapshot", async () => {
  const productionFiles = [
    join(moduleDirectory, "engagement.ts"),
    join(moduleDirectory, "service.ts"),
    join(moduleDirectory, "../../../app/page.tsx"),
    join(moduleDirectory, "../../../components/echo/EngagementTracker.tsx"),
  ];
  const sources = await Promise.all(
    productionFiles.map((file) => readFile(file, "utf8")),
  );

  assert.equal(sources.some((source) => source.includes("engagement.mock")), false);
  await assert.rejects(access(join(moduleDirectory, "engagement.mock.ts")));
});
