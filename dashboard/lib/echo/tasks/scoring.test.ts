import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyUrgency, energyFitScore, scoreTask, stalenessBonus } from "./scoring.ts";
import type { Task } from "../types/task.ts";

const NOW = new Date("2026-07-23T15:00:00Z"); // 2026-07-23 10:00 CDT

function fakeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    userId: "sebastian",
    responsibilityArea: "echo",
    title: "Test task",
    description: null,
    status: "open",
    dueAt: null,
    estimatedMinutes: 30,
    energyRequired: "medium",
    priority: "medium",
    deepWork: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    completedAt: null,
    ...overrides,
  };
}

test("classifyUrgency: no due date is later-or-none", () => {
  assert.equal(classifyUrgency(null, NOW), "later-or-none");
});

test("classifyUrgency: a due date in the past is overdue", () => {
  assert.equal(classifyUrgency("2026-07-20T15:00:00Z", NOW), "overdue");
});

test("classifyUrgency: a due date on the same Chicago calendar day is due-today", () => {
  assert.equal(classifyUrgency("2026-07-23T23:00:00Z", NOW), "due-today");
});

test("classifyUrgency: 2-3 days out is due-soon", () => {
  assert.equal(classifyUrgency("2026-07-25T15:00:00Z", NOW), "due-soon");
  assert.equal(classifyUrgency("2026-07-26T15:00:00Z", NOW), "due-soon");
});

test("classifyUrgency: 4-7 days out is due-this-week", () => {
  assert.equal(classifyUrgency("2026-07-27T15:00:00Z", NOW), "due-this-week");
  assert.equal(classifyUrgency("2026-07-30T15:00:00Z", NOW), "due-this-week");
});

test("classifyUrgency: more than 7 days out is later-or-none", () => {
  assert.equal(classifyUrgency("2026-08-15T15:00:00Z", NOW), "later-or-none");
});

test("energyFitScore: a low-energy task always fits, even at energy 1", () => {
  assert.equal(energyFitScore("low", 1) > 0, true);
});

test("energyFitScore: a medium-energy task fits at energy 4 but not energy 3", () => {
  assert.equal(energyFitScore("medium", 4) > 0, true);
  assert.equal(energyFitScore("medium", 3) < 0, true);
});

test("energyFitScore: a high-energy task fits at energy 7 but not energy 6", () => {
  assert.equal(energyFitScore("high", 7) > 0, true);
  assert.equal(energyFitScore("high", 6) < 0, true);
});

test("stalenessBonus: a brand-new task has zero bonus", () => {
  assert.equal(stalenessBonus(NOW.toISOString(), NOW), 0);
});

test("stalenessBonus: grows by roughly 1 per day open and is capped", () => {
  const fiveDaysAgo = new Date("2026-07-18T15:00:00Z").toISOString();
  const fiftyDaysAgo = new Date("2026-06-03T15:00:00Z").toISOString();
  assert.equal(stalenessBonus(fiveDaysAgo, NOW), 5);
  assert.equal(stalenessBonus(fiftyDaysAgo, NOW), 10); // capped
});

test("stalenessBonus: never goes negative even if createdAt is in the future", () => {
  const future = new Date("2026-07-30T15:00:00Z").toISOString();
  assert.equal(stalenessBonus(future, NOW), 0);
});

test("scoreTask: an overdue, high-priority task outranks a distant low-priority one", () => {
  const overdueUrgent = fakeTask({
    dueAt: "2026-07-20T15:00:00Z",
    priority: "high",
    energyRequired: "low",
  });
  const distantLowPriority = fakeTask({
    dueAt: "2026-09-01T15:00:00Z",
    priority: "low",
    energyRequired: "low",
  });

  const context = { now: NOW, currentEnergy: 5 };
  assert.equal(
    scoreTask(overdueUrgent, context) > scoreTask(distantLowPriority, context),
    true,
  );
});

test("scoreTask: low current energy demotes a high-energy task below a comparable low-energy one", () => {
  const highEnergyTask = fakeTask({ energyRequired: "high", priority: "medium" });
  const lowEnergyTask = fakeTask({ energyRequired: "low", priority: "medium" });

  const exhausted = { now: NOW, currentEnergy: 2 };
  assert.equal(scoreTask(highEnergyTask, exhausted) < scoreTask(lowEnergyTask, exhausted), true);
});

test("scoreTask: an old, otherwise-unremarkable task scores higher than a brand-new twin", () => {
  const oldTask = fakeTask({ createdAt: new Date("2026-07-13T15:00:00Z").toISOString() });
  const newTask = fakeTask({ createdAt: NOW.toISOString() });

  const context = { now: NOW, currentEnergy: 5 };
  assert.equal(scoreTask(oldTask, context) > scoreTask(newTask, context), true);
});

test("scoreTask is deterministic: identical input always produces identical output", () => {
  const task = fakeTask({
    dueAt: "2026-07-24T15:00:00Z",
    priority: "high",
    energyRequired: "medium",
    createdAt: new Date("2026-07-19T15:00:00Z").toISOString(),
  });
  const context = { now: NOW, currentEnergy: 6 };

  const scores = Array.from({ length: 5 }, () => scoreTask(task, context));
  assert.equal(new Set(scores).size, 1);
});
