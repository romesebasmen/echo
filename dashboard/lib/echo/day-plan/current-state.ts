import { isCheckInComplete } from "./check-in.ts";
import { createPlanningContext } from "./planning-context.ts";
import type { DayPlan, ScheduleBlock } from "../types/day-plan.ts";
import type { PlanningContext } from "../types/planning-context.ts";
import type { Task, TaskStatus } from "../types/task.ts";

export interface LoadCurrentDayPlanStateDeps {
  getDayPlanForDate: (planDate: string) => Promise<DayPlan | null>;
  listScheduleBlocks: (dayPlanId: string) => Promise<ScheduleBlock[]>;
  listTasks: (options: { status?: TaskStatus }) => Promise<Task[]>;
}

export interface CurrentDayPlanState {
  dayPlan: DayPlan | null;
  planningContext: PlanningContext | null;
  scheduleBlocks: ScheduleBlock[];
  unscheduled: Task[];
}

function planningContextForDayPlan(dayPlan: DayPlan): PlanningContext | null {
  if (!isCheckInComplete(dayPlan)) return null;

  return createPlanningContext({
    planDate: dayPlan.planDate,
    availableFrom: dayPlan.availableFrom,
    endOfWorkTime: dayPlan.endOfWorkTime,
    energy: dayPlan.energy,
    stress: dayPlan.stress!,
    sleepQuality: dayPlan.sleepQuality!,
    hasEaten: dayPlan.hasEaten!,
    checkInNotes: dayPlan.checkInNotes,
    checkInCompletedAt: dayPlan.checkInCompletedAt!,
  });
}

export async function loadCurrentDayPlanState(
  planDate: string,
  deps: LoadCurrentDayPlanStateDeps,
): Promise<CurrentDayPlanState> {
  const dayPlan = await deps.getDayPlanForDate(planDate);
  if (!dayPlan) {
    return {
      dayPlan: null,
      planningContext: null,
      scheduleBlocks: [],
      unscheduled: [],
    };
  }

  const planningContext = planningContextForDayPlan(dayPlan);

  // A setup plan has no current schedule. The atomic check-in write removes
  // old blocks, and this status guard also keeps a stale or incomplete plan
  // from being presented as generated if legacy data is inconsistent.
  if (dayPlan.status !== "generated" || !planningContext) {
    return { dayPlan, planningContext, scheduleBlocks: [], unscheduled: [] };
  }

  const [persistedScheduleBlocks, tasks] = await Promise.all([
    deps.listScheduleBlocks(dayPlan.id),
    deps.listTasks({}),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const scheduleBlocks = persistedScheduleBlocks.flatMap((block) => {
    if (block.sourceType !== "task") return [block];

    const sourceTask = block.sourceId ? taskById.get(block.sourceId) : null;
    // A deleted task must not survive as an apparently actionable plan item.
    if (!sourceTask) return [];

    // Task status is authoritative even if it was changed from the Tasks
    // page instead of through the day-plan action endpoint.
    if (block.status === "scheduled" && sourceTask.status === "done") {
      return [{ ...block, status: "completed" as const }];
    }
    return [block];
  });
  const openTasks = tasks.filter((task) => task.status === "open");
  const plannedTaskIds = new Set(
    scheduleBlocks
      .filter(
        (block) =>
          block.sourceType === "task" &&
          block.status === "scheduled" &&
          block.sourceId !== null,
      )
      .map((block) => block.sourceId as string),
  );

  return {
    dayPlan,
    planningContext,
    scheduleBlocks,
    unscheduled: openTasks.filter((task) => !plannedTaskIds.has(task.id)),
  };
}
