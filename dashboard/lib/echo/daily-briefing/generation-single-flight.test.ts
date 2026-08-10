import assert from "node:assert/strict";
import { test } from "node:test";
import { runBriefingGenerationSingleFlight } from "./generation-single-flight.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("concurrent generation for one day shares one provider workflow", async () => {
  const work = deferred<string>();
  let calls = 0;
  const generate = () => {
    calls += 1;
    return work.promise;
  };

  const first = runBriefingGenerationSingleFlight("2026-08-09", generate);
  const second = runBriefingGenerationSingleFlight("2026-08-09", generate);

  assert.equal(calls, 1);
  assert.equal(first, second);

  work.resolve("briefing");
  assert.deepEqual(await Promise.all([first, second]), ["briefing", "briefing"]);
});

test("a failed generation releases the day for an explicit retry", async () => {
  const failure = deferred<string>();
  const expectedError = new Error("simulated failure");
  let calls = 0;

  const first = runBriefingGenerationSingleFlight("2026-08-10", () => {
    calls += 1;
    return failure.promise;
  });
  failure.reject(expectedError);
  await assert.rejects(first, (error: unknown) => error === expectedError);

  const second = runBriefingGenerationSingleFlight("2026-08-10", async () => {
    calls += 1;
    return "recovered";
  });

  assert.equal(await second, "recovered");
  assert.equal(calls, 2);
});

test("different Chicago days do not block each other", async () => {
  const firstDay = deferred<string>();
  const secondDay = deferred<string>();
  let calls = 0;

  const first = runBriefingGenerationSingleFlight("2026-08-11", () => {
    calls += 1;
    return firstDay.promise;
  });
  const second = runBriefingGenerationSingleFlight("2026-08-12", () => {
    calls += 1;
    return secondDay.promise;
  });

  assert.equal(calls, 2);
  firstDay.resolve("first");
  secondDay.resolve("second");
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
});
