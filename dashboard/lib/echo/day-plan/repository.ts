import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type {
  Commitment,
  DayPlan,
  DayPlanStatus,
  ResponsibilityArea,
} from "@/lib/echo/types";

const USER_ID = "sebastian";

export class MissingDayPlansTableError extends Error {
  constructor() {
    super("The day_plans table does not exist yet. See the setup SQL to create it.");
    this.name = "MissingDayPlansTableError";
  }
}

export class MissingCommitmentsTableError extends Error {
  constructor() {
    super("The commitments table does not exist yet. See the setup SQL to create it.");
    this.name = "MissingCommitmentsTableError";
  }
}

interface DayPlanRow {
  id: string;
  user_id: string;
  plan_date: string;
  available_from: string;
  energy: number;
  end_of_work_time: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CommitmentRow {
  id: string;
  day_plan_id: string;
  title: string;
  start_time: string;
  end_time: string;
  responsibility_area: string | null;
  created_at: string;
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

function toDayPlan(row: DayPlanRow): DayPlan {
  return {
    id: row.id,
    userId: row.user_id,
    planDate: row.plan_date,
    availableFrom: row.available_from,
    energy: row.energy,
    endOfWorkTime: row.end_of_work_time,
    status: row.status as DayPlanStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCommitment(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    dayPlanId: row.day_plan_id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    responsibilityArea: row.responsibility_area as ResponsibilityArea | null,
    createdAt: row.created_at,
  };
}

export async function getDayPlanForDate(planDate: string): Promise<DayPlan | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("day_plans")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("plan_date", planDate)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) throw new MissingDayPlansTableError();
    throw error;
  }

  return data ? toDayPlan(data as DayPlanRow) : null;
}

export interface UpsertDayPlanInput {
  planDate: string;
  availableFrom: string;
  energy: number;
  endOfWorkTime: string;
  status?: DayPlanStatus;
}

// Upserts on (user_id, plan_date), same convention as daily_briefings — at
// most one plan per user per day.
export async function upsertDayPlan(input: UpsertDayPlanInput): Promise<DayPlan> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("day_plans")
    .upsert(
      {
        user_id: USER_ID,
        plan_date: input.planDate,
        available_from: input.availableFrom,
        energy: input.energy,
        end_of_work_time: input.endOfWorkTime,
        status: input.status ?? "setup",
      },
      { onConflict: "user_id,plan_date" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingDayPlansTableError();
    throw error;
  }

  return toDayPlan(data as DayPlanRow);
}

export async function updateDayPlanStatus(
  id: string,
  status: DayPlanStatus,
): Promise<DayPlan> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("day_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", USER_ID)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingDayPlansTableError();
    throw error;
  }

  return toDayPlan(data as DayPlanRow);
}

export async function listCommitments(dayPlanId: string): Promise<Commitment[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("commitments")
    .select("*")
    .eq("day_plan_id", dayPlanId)
    .order("start_time", { ascending: true });

  if (error) {
    if (isMissingTableError(error)) throw new MissingCommitmentsTableError();
    throw error;
  }

  return (data ?? []).map(toCommitment);
}

export interface CreateCommitmentInput {
  dayPlanId: string;
  title: string;
  startTime: string;
  endTime: string;
  responsibilityArea?: ResponsibilityArea | null;
}

export async function createCommitment(input: CreateCommitmentInput): Promise<Commitment> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("commitments")
    .insert({
      day_plan_id: input.dayPlanId,
      title: input.title,
      start_time: input.startTime,
      end_time: input.endTime,
      responsibility_area: input.responsibilityArea ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingCommitmentsTableError();
    throw error;
  }

  return toCommitment(data as CommitmentRow);
}

export async function deleteCommitment(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase.from("commitments").delete().eq("id", id);

  if (error) {
    if (isMissingTableError(error)) throw new MissingCommitmentsTableError();
    throw error;
  }
}
