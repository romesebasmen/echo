// Relative imports (not "@/...") so this pure, dependency-free module can
// also run under Node's native test runner — see scoring.ts for the same
// pattern and rationale.
import { scoreTask } from "../tasks/scoring.ts";
import type { ResponsibilityArea } from "../types/responsibility-area.ts";
import type { Task } from "../types/task.ts";
import type { PlanningContext } from "../types/planning-context.ts";
import type {
  Commitment,
  ScheduleBlock,
  ScheduleBlockSourceType,
  ScheduleBlockStatus,
} from "../types/day-plan.ts";

// Deterministic scheduling engine — no AI anywhere in this file. Given the
// same tasks, commitments, and time window, it always produces the same
// timeline. The one AI-assisted feature planned for a later milestone
// (regenerate "with Echo") only reasons about which items to keep or defer;
// it never replaces this arithmetic.

const DEFAULT_TASK_MINUTES = 30;
const MS_PER_MINUTE = 60 * 1000;

export interface DraftScheduleBlock {
  sourceType: ScheduleBlockSourceType;
  sourceId: string | null;
  title: string;
  responsibilityArea: ResponsibilityArea | null;
  startTime: string;
  endTime: string;
  status: ScheduleBlockStatus;
  orderIndex: number;
}

interface WorkInterval {
  startMs: number;
  endMs: number;
  // Minutes of continuous work already consumed from the start of this
  // interval since the last break (or since the interval began).
  continuousMinutes: number;
}

function toMs(value: string | Date): number {
  return typeof value === "string" ? new Date(value).getTime() : value.getTime();
}

function intervalMinutes(interval: WorkInterval): number {
  return (interval.endMs - interval.startMs) / MS_PER_MINUTE;
}

// Subtracts a set of busy [start, end) intervals from a single window,
// returning the remaining free intervals in chronological order.
function subtractBusyIntervals(
  windowStartMs: number,
  windowEndMs: number,
  busy: { startMs: number; endMs: number }[],
): WorkInterval[] {
  const sortedBusy = [...busy].sort((a, b) => a.startMs - b.startMs);
  const free: WorkInterval[] = [];
  let cursor = windowStartMs;

  for (const block of sortedBusy) {
    const start = Math.max(block.startMs, windowStartMs);
    const end = Math.min(block.endMs, windowEndMs);
    if (start >= end) continue;
    if (start > cursor) {
      free.push({ startMs: cursor, endMs: start, continuousMinutes: 0 });
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < windowEndMs) {
    free.push({ startMs: cursor, endMs: windowEndMs, continuousMinutes: 0 });
  }

  return free;
}

// Deep-work items pick the interval with the most remaining room, to
// preserve contiguous focus time. Everything else picks the earliest
// fitting interval, conserving large intervals for later deep-work
// candidates. `intervals` is assumed chronologically sorted.
function pickIntervalIndex(
  intervals: WorkInterval[],
  durationMinutes: number,
  deepWork: boolean,
): number {
  const fitting = intervals
    .map((interval, index) => ({ index, remaining: intervalMinutes(interval) }))
    .filter(({ remaining }) => remaining >= durationMinutes);

  if (fitting.length === 0) return -1;
  if (!deepWork) return fitting[0].index;

  return fitting.reduce((best, current) => (current.remaining > best.remaining ? current : best))
    .index;
}

function requiresBreakBeforeTask(
  interval: WorkInterval,
  durationMinutes: number,
  planningContext: PlanningContext,
): boolean {
  return (
    interval.continuousMinutes > 0 &&
    interval.continuousMinutes + durationMinutes > planningContext.breakAfterMinutes
  );
}

function pickTaskIntervalIndex(
  intervals: WorkInterval[],
  durationMinutes: number,
  deepWork: boolean,
  planningContext: PlanningContext,
): number {
  const fitting = intervals
    .map((interval, index) => {
      const requiredMinutes =
        durationMinutes +
        (requiresBreakBeforeTask(interval, durationMinutes, planningContext)
          ? planningContext.breakDurationMinutes
          : 0);
      return { index, remaining: intervalMinutes(interval), requiredMinutes };
    })
    .filter(({ remaining, requiredMinutes }) => remaining >= requiredMinutes);

  if (fitting.length === 0) return -1;
  if (!deepWork) return fitting[0].index;

  return fitting.reduce((best, current) =>
    current.remaining > best.remaining ? current : best,
  ).index;
}

function packTasksIntoIntervals(
  scoredTasks: { task: Task; score: number }[],
  freeIntervals: WorkInterval[],
  planningContext: PlanningContext,
): { blocks: DraftScheduleBlock[]; unscheduled: Task[] } {
  // Stable sort by score descending; ties broken explicitly by task id so
  // the ordering never depends on incoming array order or engine-specific
  // sort stability.
  const ordered = [...scoredTasks].sort(
    (a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id),
  );

  const intervals = freeIntervals.map((interval) => ({ ...interval }));
  const blocks: DraftScheduleBlock[] = [];
  const unscheduled: Task[] = [];
  let scheduledTaskMinutes = 0;

  for (const { task } of ordered) {
    const duration = task.estimatedMinutes ?? DEFAULT_TASK_MINUTES;

    if (scheduledTaskMinutes + duration > planningContext.maxScheduledTaskMinutes) {
      unscheduled.push(task);
      continue;
    }

    const index = pickTaskIntervalIndex(
      intervals,
      duration,
      task.deepWork,
      planningContext,
    );

    if (index === -1) {
      unscheduled.push(task);
      continue;
    }

    const interval = intervals[index];

    if (requiresBreakBeforeTask(interval, duration, planningContext)) {
      const breakStart = interval.startMs;
      const breakEnd = breakStart + planningContext.breakDurationMinutes * MS_PER_MINUTE;
      blocks.push({
        sourceType: "break",
        sourceId: null,
        title: "Break",
        responsibilityArea: null,
        startTime: new Date(breakStart).toISOString(),
        endTime: new Date(breakEnd).toISOString(),
        status: "scheduled",
        orderIndex: 0,
      });
      interval.startMs = breakEnd;
      interval.continuousMinutes = 0;
    }

    const taskStart = interval.startMs;
    const taskEnd = taskStart + duration * MS_PER_MINUTE;
    blocks.push({
      sourceType: "task",
      sourceId: task.id,
      title: task.title,
      responsibilityArea: task.responsibilityArea,
      startTime: new Date(taskStart).toISOString(),
      endTime: new Date(taskEnd).toISOString(),
      status: "scheduled",
      orderIndex: 0,
    });

    interval.startMs = taskEnd;
    interval.continuousMinutes += duration;
    scheduledTaskMinutes += duration;
  }

  return { blocks, unscheduled };
}

export interface GenerateScheduleInput {
  // Open tasks only — the caller is responsible for filtering by status.
  tasks: Task[];
  commitments: Commitment[];
  availableFrom: Date;
  endOfWorkTime: Date;
  planningContext: PlanningContext;
  now: Date;
}

export interface GenerateScheduleResult {
  blocks: DraftScheduleBlock[];
  // Tasks that didn't fit today — surfaced, never silently dropped.
  unscheduled: Task[];
}

export function generateSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const windowStartMs = toMs(input.availableFrom);
  const windowEndMs = toMs(input.endOfWorkTime);

  const commitmentBlocks: DraftScheduleBlock[] = input.commitments.map((commitment) => ({
    sourceType: "commitment",
    sourceId: commitment.id,
    title: commitment.title,
    responsibilityArea: commitment.responsibilityArea,
    startTime: commitment.startTime,
    endTime: commitment.endTime,
    status: "scheduled",
    orderIndex: 0,
  }));

  const busy = input.commitments.map((commitment) => ({
    startMs: toMs(commitment.startTime),
    endMs: toMs(commitment.endTime),
  }));
  const freeIntervals = subtractBusyIntervals(windowStartMs, windowEndMs, busy);

  const scoredTasks = input.tasks.map((task) => ({
    task,
    score: scoreTask(task, {
      now: input.now,
      currentEnergy: input.planningContext.effectiveEnergy,
    }),
  }));

  const { blocks: taskBlocks, unscheduled } = packTasksIntoIntervals(
    scoredTasks,
    freeIntervals,
    input.planningContext,
  );

  const blocks = [...commitmentBlocks, ...taskBlocks]
    .sort((a, b) => toMs(a.startTime) - toMs(b.startTime))
    .map((block, index) => ({ ...block, orderIndex: index }));

  return { blocks, unscheduled };
}

export interface RepackInput {
  // All of today's existing blocks, any status.
  blocks: ScheduleBlock[];
  commitments: Commitment[];
  now: Date;
  endOfWorkTime: Date;
}

export interface RepackResult {
  // completed/skipped/commitment blocks unchanged; scheduled blocks
  // re-laid-out from `now` forward, same relative order and durations.
  blocks: ScheduleBlock[];
  // Scheduled blocks that no longer fit before endOfWorkTime — surfaced,
  // never silently dropped.
  bumped: ScheduleBlock[];
}

// Mechanical re-layout only — preserves whatever order/duration blocks
// already had. Re-prioritization (deciding what to keep vs. cut) is the
// job of the explicit, optional AI-assisted regenerate, not this function.
export function repackFrom(input: RepackInput): RepackResult {
  const nowMs = toMs(input.now);
  const endMs = toMs(input.endOfWorkTime);

  const fixed = input.blocks.filter(
    (block) => block.sourceType === "commitment" || block.status !== "scheduled",
  );
  const movable = input.blocks
    .filter((block) => block.sourceType !== "commitment" && block.status === "scheduled")
    .sort((a, b) => toMs(a.startTime) - toMs(b.startTime));

  const busy = input.commitments
    .filter((commitment) => toMs(commitment.endTime) > nowMs)
    .map((commitment) => ({
      startMs: Math.max(toMs(commitment.startTime), nowMs),
      endMs: toMs(commitment.endTime),
    }));

  const freeIntervals = subtractBusyIntervals(nowMs, endMs, busy);

  const relaid: ScheduleBlock[] = [];
  const bumped: ScheduleBlock[] = [];

  for (const block of movable) {
    const duration = (toMs(block.endTime) - toMs(block.startTime)) / MS_PER_MINUTE;
    const index = pickIntervalIndex(freeIntervals, duration, false);

    if (index === -1) {
      bumped.push(block);
      continue;
    }

    const interval = freeIntervals[index];
    const startMs = interval.startMs;
    const endMsBlock = startMs + duration * MS_PER_MINUTE;

    relaid.push({
      ...block,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMsBlock).toISOString(),
    });

    interval.startMs = endMsBlock;
  }

  const blocks = [...fixed, ...relaid]
    .sort((a, b) => toMs(a.startTime) - toMs(b.startTime))
    .map((block, index) => ({ ...block, orderIndex: index }));

  return { blocks, bumped };
}

// Current-time-aware "what should I be doing right now" selection:
// 1. the currently active scheduled block, if `now` falls within one;
// 2. otherwise, the next scheduled block starting after `now`;
// 3. otherwise, the earliest scheduled block whose window already fully
//    passed without being completed or skipped (needs recovery);
// 4. otherwise, null — everything is done, skipped, or there's nothing left.
export function selectNextStep(blocks: ScheduleBlock[], now: Date): ScheduleBlock | null {
  const nowMs = toMs(now);
  const scheduled = blocks.filter((block) => block.status === "scheduled");

  const active = scheduled.find(
    (block) => toMs(block.startTime) <= nowMs && nowMs < toMs(block.endTime),
  );
  if (active) return active;

  const upcoming = scheduled
    .filter((block) => toMs(block.startTime) > nowMs)
    .sort((a, b) => toMs(a.startTime) - toMs(b.startTime))[0];
  if (upcoming) return upcoming;

  const needsRecovery = scheduled
    .filter((block) => toMs(block.endTime) <= nowMs)
    .sort((a, b) => toMs(a.startTime) - toMs(b.startTime))[0];
  if (needsRecovery) return needsRecovery;

  return null;
}
