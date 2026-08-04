import { test } from "node:test";
import assert from "node:assert/strict";
import { runExclusiveOperation, saveThenGenerate } from "./client-flow.ts";

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
