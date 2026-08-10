import assert from "node:assert/strict";
import { test } from "node:test";
import { getBriefingDate } from "./date.ts";

test("briefing date uses the Chicago day before UTC midnight", () => {
  assert.equal(
    getBriefingDate(new Date("2026-08-09T04:59:59.999Z")),
    "2026-08-08",
  );
});

test("briefing date advances at Chicago midnight in summer", () => {
  assert.equal(
    getBriefingDate(new Date("2026-08-09T05:00:00.000Z")),
    "2026-08-09",
  );
});

test("briefing date observes Chicago's winter UTC offset", () => {
  assert.equal(
    getBriefingDate(new Date("2026-01-15T05:59:59.999Z")),
    "2026-01-14",
  );
  assert.equal(
    getBriefingDate(new Date("2026-01-15T06:00:00.000Z")),
    "2026-01-15",
  );
});
