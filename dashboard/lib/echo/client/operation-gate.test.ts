import assert from "node:assert/strict";
import { test } from "node:test";
import { runExclusiveClientOperation } from "./operation-gate.ts";

test("a second operation cannot enter before the active one settles", async () => {
  const gate = { busy: false };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;

  const first = runExclusiveClientOperation(gate, async () => {
    calls += 1;
    await pending;
    return "first";
  });
  const second = await runExclusiveClientOperation(gate, async () => {
    calls += 1;
    return "second";
  });

  assert.deepEqual(second, { executed: false });
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, { executed: true, value: "first" });
  assert.equal(gate.busy, false);
});

test("the gate is released when an operation fails", async () => {
  const gate = { busy: false };

  await assert.rejects(
    () =>
      runExclusiveClientOperation(gate, async () => {
        throw new Error("failed");
      }),
    /failed/,
  );

  const next = await runExclusiveClientOperation(gate, async () => "next");
  assert.deepEqual(next, { executed: true, value: "next" });
});
