import { getSupabaseServerClient } from "../supabase/server-client.ts";
import type { ServiceRoleRpcCaller } from "../supabase/service-role-client.ts";
import type {
  Commitment,
  DayPlan,
  DayPlanStatus,
  ResponsibilityArea,
  SleepQuality,
} from "../types/index.ts";
import { throwIfDailyCheckInMigrationMissing } from "./migration-error.ts";

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

export class MissingCommitmentMutationMigrationError extends Error {
  constructor() {
    super(
      "The commitment-management migration has not been applied. Apply the version-controlled Supabase migrations, then try again.",
    );
    this.name = "MissingCommitmentMutationMigrationError";
  }
}

export class CommitmentNotFoundError extends Error {
  constructor() {
    super("Commitment not found.");
    this.name = "CommitmentNotFoundError";
  }
}

export class CommitmentDayPlanNotFoundError extends Error {
  constructor() {
    super("Today's day plan was not found. Save the check-in first.");
    this.name = "CommitmentDayPlanNotFoundError";
  }
}

export class InvalidCommitmentPersistenceError extends Error {
  constructor() {
    super("The commitment could not be saved for today's plan.");
    this.name = "InvalidCommitmentPersistenceError";
  }
}

export interface DayPlanRow {
  id: string;
  user_id: string;
  plan_date: string;
  available_from: string;
  energy: number;
  stress?: number | null;
  sleep_quality?: string | null;
  has_eaten?: boolean | null;
  check_in_notes?: string | null;
  check_in_completed_at?: string | null;
  end_of_work_time: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CommitmentRow {
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

export function mapDayPlanRow(row: DayPlanRow): DayPlan {
  return {
    id: row.id,
    userId: row.user_id,
    planDate: row.plan_date,
    availableFrom: row.available_from,
    energy: row.energy,
    stress: row.stress ?? null,
    sleepQuality: (row.sleep_quality ?? null) as SleepQuality | null,
    hasEaten: row.has_eaten ?? null,
    checkInNotes: row.check_in_notes ?? null,
    checkInCompletedAt: row.check_in_completed_at ?? null,
    endOfWorkTime: row.end_of_work_time,
    status: row.status as DayPlanStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCommitmentRow(row: CommitmentRow): Commitment {
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
    .select(
      "id,user_id,plan_date,available_from,energy,stress,sleep_quality,has_eaten,check_in_notes,check_in_completed_at,end_of_work_time,status,created_at,updated_at",
    )
    .eq("user_id", USER_ID)
    .eq("plan_date", planDate)
    .maybeSingle();

  if (error) {
    throwIfDailyCheckInMigrationMissing(error);
    if (isMissingTableError(error)) throw new MissingDayPlansTableError();
    throw error;
  }

  return data ? mapDayPlanRow(data as DayPlanRow) : null;
}

export interface SaveDayPlanCheckInInput {
  planDate: string;
  availableFrom: string;
  energy: number;
  stress: number;
  sleepQuality: SleepQuality;
  hasEaten: boolean;
  checkInNotes: string | null;
  checkInCompletedAt: string;
  endOfWorkTime: string;
}

// Upserts on (user_id, plan_date), same convention as daily_briefings — at
// most one plan per user per day.
export async function saveDayPlanCheckIn(input: SaveDayPlanCheckInInput): Promise<DayPlan> {
  const { callSupabaseServiceRoleRpc } = await import(
    "../supabase/service-role-client.ts"
  );
  return saveDayPlanCheckInWithRpc(input, callSupabaseServiceRoleRpc);
}

export async function saveDayPlanCheckInWithRpc(
  input: SaveDayPlanCheckInInput,
  callRpc: ServiceRoleRpcCaller,
): Promise<DayPlan> {
  const { data, error } = await callRpc("save_day_plan_check_in", {
    p_user_id: USER_ID,
    p_plan_date: input.planDate,
    p_available_from: input.availableFrom,
    p_energy: input.energy,
    p_stress: input.stress,
    p_sleep_quality: input.sleepQuality,
    p_has_eaten: input.hasEaten,
    p_check_in_notes: input.checkInNotes,
    p_check_in_completed_at: input.checkInCompletedAt,
    p_end_of_work_time: input.endOfWorkTime,
  });

  if (error) {
    throwIfDailyCheckInMigrationMissing(error);
    if (isMissingTableError(error)) throw new MissingDayPlansTableError();
    throw error;
  }

  return mapDayPlanRow(data as DayPlanRow);
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

  return (data ?? []).map(mapCommitmentRow);
}

export interface CreateCommitmentInput {
  dayPlanId: string;
  title: string;
  startTime: string;
  endTime: string;
  responsibilityArea?: ResponsibilityArea | null;
}

export async function createCommitment(input: CreateCommitmentInput): Promise<Commitment> {
  const { callSupabaseServiceRoleRpc } = await import(
    "../supabase/service-role-client.ts"
  );
  return createCommitmentWithRpc(input, callSupabaseServiceRoleRpc);
}

function throwCommitmentMutationError(
  functionName: string,
  error: PostgrestErrorLike,
): never {
  const message = error.message ?? "";
  if (
    (error.code === "PGRST202" || error.code === "42883") &&
    message.toLowerCase().includes(functionName)
  ) {
    throw new MissingCommitmentMutationMigrationError();
  }
  if (isMissingTableError(error)) throw new MissingCommitmentsTableError();
  if (error.code === "P0001" && message.includes("ECHO_DAY_PLAN_NOT_FOUND")) {
    throw new CommitmentDayPlanNotFoundError();
  }
  if (error.code === "P0001" && message.includes("ECHO_COMMITMENT_NOT_FOUND")) {
    throw new CommitmentNotFoundError();
  }
  if (
    error.code === "P0001" &&
    (message.includes("ECHO_INVALID_COMMITMENT") ||
      message.includes("ECHO_COMMITMENT_WRONG_DAY"))
  ) {
    throw new InvalidCommitmentPersistenceError();
  }
  throw error;
}

export async function createCommitmentWithRpc(
  input: CreateCommitmentInput,
  callRpc: ServiceRoleRpcCaller,
): Promise<Commitment> {
  const { data, error } = await callRpc("create_day_plan_commitment", {
    p_day_plan_id: input.dayPlanId,
    p_title: input.title,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_responsibility_area: input.responsibilityArea ?? null,
  });

  if (error) {
    throwCommitmentMutationError("create_day_plan_commitment", error);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new InvalidCommitmentPersistenceError();
  }
  return mapCommitmentRow(data as CommitmentRow);
}

export async function deleteCommitment(
  dayPlanId: string,
  commitmentId: string,
): Promise<void> {
  const { callSupabaseServiceRoleRpc } = await import(
    "../supabase/service-role-client.ts"
  );
  return deleteCommitmentWithRpc(
    dayPlanId,
    commitmentId,
    callSupabaseServiceRoleRpc,
  );
}

export async function deleteCommitmentWithRpc(
  dayPlanId: string,
  commitmentId: string,
  callRpc: ServiceRoleRpcCaller,
): Promise<void> {
  const { data, error } = await callRpc("delete_day_plan_commitment", {
    p_day_plan_id: dayPlanId,
    p_commitment_id: commitmentId,
  });

  if (error) {
    throwCommitmentMutationError("delete_day_plan_commitment", error);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new InvalidCommitmentPersistenceError();
  }
}
