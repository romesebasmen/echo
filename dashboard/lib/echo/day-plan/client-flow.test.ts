import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyStoredRegenerationProposal,
  DayPlanClientRequestError,
  invalidateStoredRegenerationProposal,
  runExclusiveOperation,
  saveThenGenerate,
  saveThenRequestRegeneration,
} from "./client-flow.ts";
import { validateDayPlanRegenerationProposal } from "./regeneration-proposal.ts";
import type { DayPlanRegenerationProposalEnvelope } from "../types/day-plan-regeneration.ts";

function proposalEnvelope(): DayPlanRegenerationProposalEnvelope {
  return {
    schemaVersion: 1,
    recommendation: validateDayPlanRegenerationProposal(
      {
        explanation: "Protect the highest-value work.",
        recommendations: [{ taskId: "task-1", disposition: "prioritize" }],
      },
      { openTaskIds: ["task-1"] },
    ),
    inputFingerprint: "a".repeat(64),
    expectedCheckInCompletedAt: "2026-08-08T14:00:00.000Z",
    generatedAt: "2026-08-08T14:01:00.000Z",
    taskSummaries: [
      {
        id: "task-1",
        title: "Important task",
        responsibilityArea: "echo",
        estimatedMinutes: 45,
      },
    ],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test("build flow saves the current local input before generation", async () => {
  const calls: string[] = [];
  const localInput = { energy: 2, stress: 9 };

  const result = await saveThenGenerate(
    localInput,
    async (input) => {
      calls.push(`save:${input.energy}:${input.stress}`);
      return "saved";
    },
    async () => {
      calls.push("generate");
      return "generated";
    },
  );

  assert.deepEqual(calls, ["save:2:9", "generate"]);
  assert.deepEqual(result, { saved: "saved", generated: "generated" });
});

test("generation does not run when saving the current edits fails", async () => {
  let generated = false;
  await assert.rejects(
    () =>
      saveThenGenerate(
        { energy: 2 },
        async () => {
          throw new Error("save failed");
        },
        async () => {
          generated = true;
        },
      ),
    /save failed/,
  );
  assert.equal(generated, false);
});

test("exclusive operation gate prevents save and generate flows from racing", async () => {
  const gate = { busy: false };
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runExclusiveOperation(gate, async () => {
    await firstPending;
    return "first";
  });
  const second = await runExclusiveOperation(gate, async () => "second");

  assert.deepEqual(second, { executed: false });
  releaseFirst();
  assert.deepEqual(await first, { executed: true, value: "first" });
  assert.equal(gate.busy, false);
});

test("regeneration saves current input before requesting and storing a proposal", async () => {
  const calls: string[] = [];
  let stored: DayPlanRegenerationProposalEnvelope | null = null;
  const expectedProposal = proposalEnvelope();

  const result = await saveThenRequestRegeneration(
    { energy: 3, checkInNotes: "Rough morning" },
    async (input) => {
      calls.push(`save:${input.energy}:${input.checkInNotes}`);
      return { checkInCompletedAt: "2026-08-08T14:00:00.000Z" };
    },
    async (saved) => {
      calls.push(`regenerate:${saved.checkInCompletedAt}`);
      return expectedProposal;
    },
    (proposal) => {
      calls.push("store");
      stored = proposal;
    },
  );

  assert.deepEqual(calls, [
    "save:3:Rough morning",
    "regenerate:2026-08-08T14:00:00.000Z",
    "store",
  ]);
  assert.equal(stored, expectedProposal);
  assert.equal(result.proposal, expectedProposal);
});

test("failed regeneration save prevents the proposal request and storage", async () => {
  let requestCalls = 0;
  let stored: DayPlanRegenerationProposalEnvelope | null = null;

  await assert.rejects(
    () =>
      saveThenRequestRegeneration(
        { energy: 3 },
        async () => {
          throw new Error("save failed");
        },
        async () => {
          requestCalls += 1;
          return proposalEnvelope();
        },
        (proposal) => {
          stored = proposal;
        },
      ),
    /save failed/,
  );

  assert.equal(requestCalls, 0);
  assert.equal(stored, null);
});

test("failed regeneration request does not fabricate or store a proposal", async () => {
  let stored: DayPlanRegenerationProposalEnvelope | null = null;

  await assert.rejects(
    () =>
      saveThenRequestRegeneration(
        { energy: 3 },
        async () => ({ checkInCompletedAt: "2026-08-08T14:00:00.000Z" }),
        async () => {
          throw new DayPlanClientRequestError("Provider unavailable.", 502);
        },
        (proposal) => {
          stored = proposal;
        },
      ),
    /Provider unavailable/,
  );

  assert.equal(stored, null);
});

test("a meaningful local check-in edit invalidates the stored proposal", () => {
  let stored: DayPlanRegenerationProposalEnvelope | null = proposalEnvelope();

  invalidateStoredRegenerationProposal(() => {
    stored = null;
  });

  assert.equal(stored, null);
});

test("dismiss invalidates the stored proposal", () => {
  let stored: DayPlanRegenerationProposalEnvelope | null = proposalEnvelope();

  invalidateStoredRegenerationProposal(() => {
    stored = null;
  });

  assert.equal(stored, null);
});

test("Apply sends only the trusted application fields required by the API", async () => {
  const proposal = proposalEnvelope();
  let request: Record<string, unknown> | null = null;

  await applyStoredRegenerationProposal(
    proposal,
    async (application) => {
      request = application as unknown as Record<string, unknown>;
      return { scheduleBlocks: [] };
    },
    () => undefined,
    () => undefined,
  );

  assert.deepEqual(request, {
    schemaVersion: 1,
    recommendation: proposal.recommendation,
    inputFingerprint: proposal.inputFingerprint,
    expectedCheckInCompletedAt: proposal.expectedCheckInCompletedAt,
  });
  assert.deepEqual(Object.keys(request!).sort(), [
    "expectedCheckInCompletedAt",
    "inputFingerprint",
    "recommendation",
    "schemaVersion",
  ]);
});

test("successful Apply updates generated state and clears the proposal", async () => {
  let stored: DayPlanRegenerationProposalEnvelope | null = proposalEnvelope();
  let generatedState: { scheduleBlocks: string[] } | null = null;
  const generated = { scheduleBlocks: ["block-1"] };

  await applyStoredRegenerationProposal(
    stored,
    async () => generated,
    (result) => {
      generatedState = result;
    },
    () => {
      stored = null;
    },
  );

  assert.deepEqual(generatedState, generated);
  assert.equal(stored, null);
});

test("stale Apply clears the proposal without updating generated state", async () => {
  let stored: DayPlanRegenerationProposalEnvelope | null = proposalEnvelope();
  let generatedState: { scheduleBlocks: string[] } | null = null;

  await assert.rejects(
    () =>
      applyStoredRegenerationProposal(
        stored!,
        async () => {
          throw new DayPlanClientRequestError("Proposal is stale.", 409);
        },
        (result) => {
          generatedState = result;
        },
        () => {
          stored = null;
        },
      ),
    /Proposal is stale/,
  );

  assert.equal(generatedState, null);
  assert.equal(stored, null);
});

test("failed non-stale Apply preserves proposal and generated schedule state", async () => {
  const proposal = proposalEnvelope();
  let stored: DayPlanRegenerationProposalEnvelope | null = proposal;
  const previousGeneratedState = { scheduleBlocks: ["existing-block"] };
  let generatedState = previousGeneratedState;

  await assert.rejects(
    () =>
      applyStoredRegenerationProposal(
        proposal,
        async () => {
          throw new DayPlanClientRequestError("Apply failed.", 500);
        },
        (result) => {
          generatedState = result;
        },
        () => {
          stored = null;
        },
      ),
    /Apply failed/,
  );

  assert.equal(generatedState, previousGeneratedState);
  assert.equal(stored, proposal);
});

async function assertOperationCannotRaceRegeneration(
  competingOperation: "save" | "build",
): Promise<void> {
  const gate = { busy: false };
  const pending = deferred();
  let proposalRequests = 0;
  const first = runExclusiveOperation(gate, async () => {
    await pending.promise;
    return competingOperation;
  });

  const regeneration = await runExclusiveOperation(gate, async () => {
    proposalRequests += 1;
    return "regenerate";
  });

  assert.deepEqual(regeneration, { executed: false });
  assert.equal(proposalRequests, 0);
  pending.resolve();
  assert.deepEqual(await first, { executed: true, value: competingOperation });
}

test("Regenerate cannot race Save", async () => {
  await assertOperationCannotRaceRegeneration("save");
});

test("Regenerate cannot race Build", async () => {
  await assertOperationCannotRaceRegeneration("build");
});

for (const activeOperation of ["save", "build", "regenerate"] as const) {
  test(`Apply cannot race ${activeOperation}`, async () => {
    const gate = { busy: false };
    const pending = deferred();
    let applyCalls = 0;
    const first = runExclusiveOperation(gate, async () => {
      await pending.promise;
      return activeOperation;
    });

    const apply = await runExclusiveOperation(gate, async () => {
      applyCalls += 1;
      return "apply";
    });

    assert.deepEqual(apply, { executed: false });
    assert.equal(applyCalls, 0);
    pending.resolve();
    await first;
  });
}

test("double Regenerate starts only one active operation", async () => {
  const gate = { busy: false };
  const pending = deferred();
  let proposalRequests = 0;
  const regenerate = () =>
    runExclusiveOperation(gate, async () => {
      proposalRequests += 1;
      await pending.promise;
      return proposalEnvelope();
    });

  const first = regenerate();
  const second = await regenerate();

  assert.deepEqual(second, { executed: false });
  assert.equal(proposalRequests, 1);
  pending.resolve();
  assert.equal((await first).executed, true);
});
