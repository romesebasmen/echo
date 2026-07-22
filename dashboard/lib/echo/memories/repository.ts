import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type {
  Memory,
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
  MemorySourceType,
  MemoryStatus,
} from "@/lib/echo/types";

const USER_ID = "sebastian";

export class MissingMemoriesTableError extends Error {
  constructor() {
    super(
      "The memories table does not exist yet. See the setup SQL to create it.",
    );
    this.name = "MissingMemoriesTableError";
  }
}

interface MemoryRow {
  id: string;
  user_id: string;
  category: string;
  title: string;
  description: string;
  importance: string;
  confidence: string;
  source_type: string;
  source_message_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
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

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category as MemoryCategory,
    title: row.title,
    description: row.description,
    importance: row.importance as MemoryImportance,
    confidence: row.confidence as MemoryConfidence,
    sourceType: row.source_type as MemorySourceType,
    sourceMessageId: row.source_message_id,
    status: row.status as MemoryStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

export interface ListMemoriesOptions {
  status?: MemoryStatus;
  limit?: number;
}

export async function listMemories(
  options: ListMemoriesOptions = {},
): Promise<Memory[]> {
  const supabase = getSupabaseServerClient();

  let query = supabase.from("memories").select("*").eq("user_id", USER_ID);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  // Highest importance first, then most recently useful — the closest
  // proxy to "relevance" available without embeddings/vector search.
  query = query
    .order("importance", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) throw new MissingMemoriesTableError();
    throw error;
  }

  return (data ?? []).map(toMemory);
}

export interface CreateMemoryInput {
  category: MemoryCategory;
  title: string;
  description: string;
  importance: MemoryImportance;
  confidence: MemoryConfidence;
  sourceType: MemorySourceType;
  sourceMessageId: string | null;
}

export async function createMemory(input: CreateMemoryInput): Promise<Memory> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: USER_ID,
      category: input.category,
      title: input.title,
      description: input.description,
      importance: input.importance,
      confidence: input.confidence,
      source_type: input.sourceType,
      source_message_id: input.sourceMessageId,
      status: "active",
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingMemoriesTableError();
    throw error;
  }

  return toMemory(data as MemoryRow);
}

export interface UpdateMemoryInput {
  category?: MemoryCategory;
  title?: string;
  description?: string;
  importance?: MemoryImportance;
  confidence?: MemoryConfidence;
  status?: MemoryStatus;
}

export async function updateMemory(
  id: string,
  input: UpdateMemoryInput,
): Promise<Memory> {
  const supabase = getSupabaseServerClient();

  const patch: Record<string, string> = { updated_at: new Date().toISOString() };
  if (input.category) patch.category = input.category;
  if (input.title) patch.title = input.title;
  if (input.description) patch.description = input.description;
  if (input.importance) patch.importance = input.importance;
  if (input.confidence) patch.confidence = input.confidence;
  if (input.status) patch.status = input.status;

  const { data, error } = await supabase
    .from("memories")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingMemoriesTableError();
    throw error;
  }

  return toMemory(data as MemoryRow);
}

export async function deleteMemory(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) {
    if (isMissingTableError(error)) throw new MissingMemoriesTableError();
    throw error;
  }
}

export async function touchLastUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("memories")
    .update({ last_used_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    if (isMissingTableError(error)) throw new MissingMemoriesTableError();
    throw error;
  }
}
