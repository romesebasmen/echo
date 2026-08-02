import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type {
  ResponsibilityArea,
  Task,
  TaskEnergyLevel,
  TaskPriority,
  TaskStatus,
} from "@/lib/echo/types";

const USER_ID = "sebastian";

export class MissingTasksTableError extends Error {
  constructor() {
    super("The tasks table does not exist yet. See the setup SQL to create it.");
    this.name = "MissingTasksTableError";
  }
}

interface TaskRow {
  id: string;
  user_id: string;
  responsibility_area: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
  estimated_minutes: number | null;
  energy_required: string;
  priority: string;
  deep_work: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
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

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    userId: row.user_id,
    responsibilityArea: row.responsibility_area as ResponsibilityArea,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    dueAt: row.due_at,
    estimatedMinutes: row.estimated_minutes,
    energyRequired: row.energy_required as TaskEnergyLevel,
    priority: row.priority as TaskPriority,
    deepWork: row.deep_work,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export interface ListTasksOptions {
  status?: TaskStatus;
}

export async function listTasks(options: ListTasksOptions = {}): Promise<Task[]> {
  const supabase = getSupabaseServerClient();

  let query = supabase.from("tasks").select("*").eq("user_id", USER_ID);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) throw new MissingTasksTableError();
    throw error;
  }

  return (data ?? []).map(toTask);
}

export async function getTaskById(id: string): Promise<Task | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .eq("user_id", USER_ID)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) throw new MissingTasksTableError();
    throw error;
  }

  return data ? toTask(data as TaskRow) : null;
}

export interface CreateTaskInput {
  responsibilityArea: ResponsibilityArea;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  energyRequired?: TaskEnergyLevel;
  priority?: TaskPriority;
  deepWork?: boolean;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: USER_ID,
      responsibility_area: input.responsibilityArea,
      title: input.title,
      description: input.description ?? null,
      status: "open",
      due_at: input.dueAt ?? null,
      estimated_minutes: input.estimatedMinutes ?? null,
      energy_required: input.energyRequired ?? "medium",
      priority: input.priority ?? "medium",
      deep_work: input.deepWork ?? false,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingTasksTableError();
    throw error;
  }

  return toTask(data as TaskRow);
}

export interface UpdateTaskInput {
  responsibilityArea?: ResponsibilityArea;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  energyRequired?: TaskEnergyLevel;
  priority?: TaskPriority;
  deepWork?: boolean;
  completedAt?: string | null;
}

// Deliberately generic, same convention as updateMemory/updateCreativeWork —
// the caller (the route) decides side effects like stamping completedAt;
// this stays a plain data write.
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const supabase = getSupabaseServerClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.responsibilityArea) patch.responsibility_area = input.responsibilityArea;
  if (input.title) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.status) patch.status = input.status;
  if (input.dueAt !== undefined) patch.due_at = input.dueAt;
  if (input.estimatedMinutes !== undefined) patch.estimated_minutes = input.estimatedMinutes;
  if (input.energyRequired) patch.energy_required = input.energyRequired;
  if (input.priority) patch.priority = input.priority;
  if (input.deepWork !== undefined) patch.deep_work = input.deepWork;
  if (input.completedAt !== undefined) patch.completed_at = input.completedAt;

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingTasksTableError();
    throw error;
  }

  return toTask(data as TaskRow);
}

export async function deleteTask(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", USER_ID);

  if (error) {
    if (isMissingTableError(error)) throw new MissingTasksTableError();
    throw error;
  }
}
