import { getSupabaseServerClient } from "../supabase/server-client.ts";
import type {
  DayPlan,
  ResponsibilityArea,
  ScheduleBlock,
  ScheduleBlockSourceType,
  ScheduleBlockStatus,
} from "../types/index.ts";
import type { DraftScheduleBlock } from "./scheduler.ts";
import { mapDayPlanRow, type DayPlanRow } from "./repository.ts";
import { throwIfDailyCheckInMigrationMissing } from "./migration-error.ts";
import type { ServiceRoleRpcCaller } from "../supabase/service-role-client.ts";
import type { ScheduleTaskBlockAction } from "./schedule-block-action.ts";

// No USER_ID filtering here — schedule_blocks is scoped indirectly through
// day_plan_id (day_plans.user_id), the same pattern commitments uses.
// Callers are expected to have already resolved dayPlanId for the current
// user before calling into this repository.

export class MissingScheduleBlocksTableError extends Error {
  constructor() {
    super("The schedule_blocks table does not exist yet. See the setup SQL to create it.");
    this.name = "MissingScheduleBlocksTableError";
  }
}

export class CheckInChangedDuringGenerationError extends Error {
  constructor() {
    super("The daily check-in changed while the plan was being generated. Build the plan again.");
    this.name = "CheckInChangedDuringGenerationError";
  }
}

export class ScheduleBlockNotFoundError extends Error {
  constructor() {
    super("Schedule block not found.");
    this.name = "ScheduleBlockNotFoundError";
  }
}

export class InvalidScheduleBlockTransitionError extends Error {
  constructor(message = "This schedule block can no longer be changed.") {
    super(message);
    this.name = "InvalidScheduleBlockTransitionError";
  }
}

export class MissingScheduleBlockActionMigrationError extends Error {
  constructor() {
    super(
      "The schedule-block action migration has not been applied. Apply the version-controlled Supabase migrations, then try again.",
    );
    this.name = "MissingScheduleBlockActionMigrationError";
  }
}

interface ScheduleBlockRow {
  id: string;
  day_plan_id: string;
  source_type: string;
  source_id: string | null;
  title: string;
  responsibility_area: string | null;
  start_time: string;
  end_time: string;
  status: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface TransitionScheduleBlockResultRow {
  schedule_block: ScheduleBlockRow;
}

interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

function isMissingTableError(error: PostgrestErrorLike): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    Boolean(error.message?.includes("Could not find the table"))
  );
}

export function toScheduleBlock(row: ScheduleBlockRow): ScheduleBlock {
  return {
    id: row.id,
    dayPlanId: row.day_plan_id,
    sourceType: row.source_type as ScheduleBlockSourceType,
    sourceId: row.source_id,
    title: row.title,
    responsibilityArea: row.responsibility_area as ResponsibilityArea | null,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status as ScheduleBlockStatus,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listScheduleBlocks(dayPlanId: string): Promise<ScheduleBlock[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("schedule_blocks")
    .select("*")
    .eq("day_plan_id", dayPlanId)
    .order("order_index", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) throw new MissingScheduleBlocksTableError();
    throw error;
  }

  return (data ?? []).map(toScheduleBlock);
}

export async function transitionScheduleTaskBlock(
  blockId: string,
  status: ScheduleTaskBlockAction,
): Promise<ScheduleBlock> {
  const { callSupabaseServiceRoleRpc } = await import(
    "../supabase/service-role-client.ts"
  );
  return transitionScheduleTaskBlockWithRpc(
    blockId,
    status,
    callSupabaseServiceRoleRpc,
  );
}

export async function transitionScheduleTaskBlockWithRpc(
  blockId: string,
  status: ScheduleTaskBlockAction,
  callRpc: ServiceRoleRpcCaller,
): Promise<ScheduleBlock> {
  const { data, error } = await callRpc("transition_day_plan_task_block", {
    p_block_id: blockId,
    p_status: status,
  });

  if (error) {
    const message = error.message ?? "";
    if (
      (error.code === "PGRST202" || error.code === "42883") &&
      message.toLowerCase().includes("transition_day_plan_task_block")
    ) {
      throw new MissingScheduleBlockActionMigrationError();
    }
    if (error.code === "P0001" && message.includes("ECHO_SCHEDULE_BLOCK_NOT_FOUND")) {
      throw new ScheduleBlockNotFoundError();
    }
    if (error.code === "P0001" && message.includes("ECHO_SCHEDULE_BLOCK_NOT_CURRENT")) {
      throw new InvalidScheduleBlockTransitionError(
        "Only task blocks in today's generated plan can be changed.",
      );
    }
    if (
      error.code === "P0001" &&
      (message.includes("ECHO_SCHEDULE_BLOCK_NOT_TASK") ||
        message.includes("ECHO_INVALID_SCHEDULE_BLOCK_TRANSITION") ||
        message.includes("ECHO_SCHEDULE_BLOCK_TASK_NOT_FOUND"))
    ) {
      throw new InvalidScheduleBlockTransitionError();
    }
    throw error;
  }

  const result = data as TransitionScheduleBlockResultRow | null;
  if (!result?.schedule_block) {
    throw new InvalidScheduleBlockTransitionError(
      "Echo could not confirm the schedule block update.",
    );
  }

  return toScheduleBlock(result.schedule_block);
}

// Deletes every existing block for the day plan and inserts the freshly
// generated/repacked set in its place — the persistence step for whatever
// lib/echo/day-plan/scheduler.ts (generateSchedule or repackFrom) computed.
// This function does not decide the timeline; it only stores it.
export interface PersistGeneratedScheduleResult {
  dayPlan: DayPlan;
  scheduleBlocks: ScheduleBlock[];
}

interface PersistGeneratedScheduleRow {
  day_plan: DayPlanRow;
  schedule_blocks: ScheduleBlockRow[];
}

export async function persistGeneratedSchedule(
  dayPlanId: string,
  expectedCheckInCompletedAt: string,
  blocks: DraftScheduleBlock[],
): Promise<PersistGeneratedScheduleResult> {
  const { callSupabaseServiceRoleRpc } = await import(
    "../supabase/service-role-client.ts"
  );
  return persistGeneratedScheduleWithRpc(
    dayPlanId,
    expectedCheckInCompletedAt,
    blocks,
    callSupabaseServiceRoleRpc,
  );
}

export async function persistGeneratedScheduleWithRpc(
  dayPlanId: string,
  expectedCheckInCompletedAt: string,
  blocks: DraftScheduleBlock[],
  callRpc: ServiceRoleRpcCaller,
): Promise<PersistGeneratedScheduleResult> {
  const { data, error } = await callRpc("replace_day_plan_schedule", {
    p_user_id: "sebastian",
    p_day_plan_id: dayPlanId,
    p_expected_check_in_completed_at: expectedCheckInCompletedAt,
    p_blocks: blocks.map((block) => ({
      source_type: block.sourceType,
      source_id: block.sourceId,
      title: block.title,
      responsibility_area: block.responsibilityArea,
      start_time: block.startTime,
      end_time: block.endTime,
      status: block.status,
      order_index: block.orderIndex,
    })),
  });

  if (error) {
    throwIfDailyCheckInMigrationMissing(error);
    if (error.code === "P0001" && error.message?.includes("ECHO_CHECK_IN_CHANGED")) {
      throw new CheckInChangedDuringGenerationError();
    }
    if (isMissingTableError(error)) throw new MissingScheduleBlocksTableError();
    throw error;
  }

  const result = data as PersistGeneratedScheduleRow;
  return {
    dayPlan: mapDayPlanRow(result.day_plan),
    scheduleBlocks: (result.schedule_blocks ?? []).map(toScheduleBlock),
  };
}

export async function updateScheduleBlockStatus(
  id: string,
  status: ScheduleBlockStatus,
): Promise<ScheduleBlock> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("schedule_blocks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingScheduleBlocksTableError();
    throw error;
  }

  return toScheduleBlock(data as ScheduleBlockRow);
}

export async function updateScheduleBlockTime(
  id: string,
  startTime: string,
  endTime: string,
): Promise<ScheduleBlock> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("schedule_blocks")
    .update({ start_time: startTime, end_time: endTime, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingScheduleBlocksTableError();
    throw error;
  }

  return toScheduleBlock(data as ScheduleBlockRow);
}
