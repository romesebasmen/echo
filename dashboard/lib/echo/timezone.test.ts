import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarDayDifference,
  isSameUserDay,
  startOfUserDay,
  toUserDateString,
} from "./timezone.ts";

test("toUserDateString converts to the Chicago calendar day, not the UTC day", () => {
  // 03:00 UTC on July 23 is 22:00 CDT on July 22 — a different calendar day
  // in Chicago than in UTC. This is the core proof the helper is
  // timezone-aware rather than doing naive UTC string slicing.
  assert.equal(toUserDateString(new Date("2026-07-23T03:00:00Z")), "2026-07-22");
  assert.equal(toUserDateString(new Date("2026-07-23T10:00:00Z")), "2026-07-23");
});

test("isSameUserDay treats a UTC day boundary crossing as the same Chicago day", () => {
  // Both instants are 2026-07-22 in Chicago (CDT, UTC-5) despite one being
  // 2026-07-23 in UTC.
  assert.equal(
    isSameUserDay(new Date("2026-07-23T03:00:00Z"), new Date("2026-07-22T20:00:00Z")),
    true,
  );
});

test("isSameUserDay returns false across a real Chicago day boundary", () => {
  assert.equal(
    isSameUserDay(new Date("2026-07-23T03:00:00Z"), new Date("2026-07-23T10:00:00Z")),
    false,
  );
});

test("startOfUserDay returns the correct UTC instant for Chicago midnight in summer (CDT, UTC-5)", () => {
  const midnight = startOfUserDay(new Date("2026-07-23T18:30:00Z"));
  assert.equal(midnight.toISOString(), "2026-07-23T05:00:00.000Z");
});

test("startOfUserDay returns the correct UTC instant for Chicago midnight in winter (CST, UTC-6)", () => {
  const midnight = startOfUserDay(new Date("2026-01-15T20:00:00Z"));
  assert.equal(midnight.toISOString(), "2026-01-15T06:00:00.000Z");
});

test("calendarDayDifference is 0 for the same instant", () => {
  const now = new Date("2026-07-23T18:30:00Z");
  assert.equal(calendarDayDifference(now, now), 0);
});

test("calendarDayDifference is negative when `to` is earlier than `from`", () => {
  assert.equal(
    calendarDayDifference(new Date("2026-07-23T12:00:00Z"), new Date("2026-07-20T12:00:00Z")),
    -3,
  );
});

test("calendarDayDifference stays correct across the DST spring-forward boundary (America/Chicago, 2026-03-08)", () => {
  // March 8, 2026 is a 23-hour day in Chicago (clocks jump 2am -> 3am).
  // Naive floor(ms / 24h) arithmetic would misfire here; the rounded
  // whole-day count must still land on exactly 2.
  const beforeTransition = new Date("2026-03-07T12:00:00Z"); // 2026-03-07 06:00 CST
  const afterTransition = new Date("2026-03-09T12:00:00Z"); // 2026-03-09 07:00 CDT
  assert.equal(calendarDayDifference(beforeTransition, afterTransition), 2);
});

test("calendarDayDifference stays correct across the DST fall-back boundary (America/Chicago, 2026-11-01)", () => {
  // November 1, 2026 is a 25-hour day in Chicago (clocks fall back 2am -> 1am).
  const beforeTransition = new Date("2026-10-31T12:00:00Z"); // 2026-10-31 08:00 CDT
  const afterTransition = new Date("2026-11-02T12:00:00Z"); // 2026-11-02 06:00 CST
  assert.equal(calendarDayDifference(beforeTransition, afterTransition), 2);
});
