import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type {
  ResponsibilityArea,
  ScheduleBlock,
  ScheduleBlockSourceType,
  ScheduleBlockStatus,
} from "@/lib/echo/types";
import type { DraftScheduleBlock } from "@/lib/echo/day-plan/scheduler";

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

function toScheduleBlock(row: ScheduleBlockRow): ScheduleBlock {
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

// Deletes every existing block for the day plan and inserts the freshly
// generated/repacked set in its place — the persistence step for whatever
// lib/echo/day-plan/scheduler.ts (generateSchedule or repackFrom) computed.
// This function does not decide the timeline; it only stores it.
export async function replaceScheduleBlocks(
  dayPlanId: string,
  blocks: DraftScheduleBlock[],
): Promise<ScheduleBlock[]> {
  const supabase = getSupabaseServerClient();

  const { error: deleteError } = await supabase
    .from("schedule_blocks")
    .delete()
    .eq("day_plan_id", dayPlanId);

  if (deleteError) {
    if (isMissingTableError(deleteError)) throw new MissingScheduleBlocksTableError();
    throw deleteError;
  }

  if (blocks.length === 0) {
    return [];
  }

  const { data, error: insertError } = await supabase
    .from("schedule_blocks")
    .insert(
      blocks.map((block) => ({
        day_plan_id: dayPlanId,
        source_type: block.sourceType,
        source_id: block.sourceId,
        title: block.title,
        responsibility_area: block.responsibilityArea,
        start_time: block.startTime,
        end_time: block.endTime,
        status: block.status,
        order_index: block.orderIndex,
      })),
    )
    .select("*")
    .order("order_index", { ascending: true });

  if (insertError) {
    if (isMissingTableError(insertError)) throw new MissingScheduleBlocksTableError();
    throw insertError;
  }

  return (data ?? []).map(toScheduleBlock);
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
