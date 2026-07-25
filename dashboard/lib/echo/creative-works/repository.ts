import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type {
  CreativeWork,
  CreativeWorkOriginType,
  CreativeWorkPackage,
  CreativeWorkStatus,
  Platform,
} from "@/lib/echo/types";

const USER_ID = "sebastian";

export class MissingCreativeWorksTableError extends Error {
  constructor() {
    super(
      "The creative_works table does not exist yet. See the setup SQL to create it.",
    );
    this.name = "MissingCreativeWorksTableError";
  }
}

interface CreativeWorkRow {
  id: string;
  user_id: string;
  origin_type: string;
  origin_id: string | null;
  platform: string;
  status: string;
  package: CreativeWorkPackage | null;
  reflection: string | null;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
  posted_at: string | null;
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

function toCreativeWork(row: CreativeWorkRow): CreativeWork {
  return {
    id: row.id,
    userId: row.user_id,
    originType: row.origin_type as CreativeWorkOriginType,
    originId: row.origin_id,
    platform: row.platform as Platform,
    status: row.status as CreativeWorkStatus,
    package: row.package,
    reflection: row.reflection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    generatedAt: row.generated_at,
    postedAt: row.posted_at,
  };
}

// "manual" is the only origin allowed a null originId — every other origin
// must point back at the record it came from.
function assertValidOrigin(
  originType: CreativeWorkOriginType,
  originId: string | null,
): void {
  if (originType !== "manual" && !originId) {
    throw new Error(
      `originId is required for origin_type "${originType}" (only "manual" allows a null originId).`,
    );
  }
}

export interface CreateCreativeWorkInput {
  originType: CreativeWorkOriginType;
  originId: string | null;
  platform: Platform;
}

export async function createCreativeWork(
  input: CreateCreativeWorkInput,
): Promise<CreativeWork> {
  assertValidOrigin(input.originType, input.originId);

  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("creative_works")
    .insert({
      user_id: USER_ID,
      origin_type: input.originType,
      origin_id: input.originId,
      platform: input.platform,
      status: "opportunity",
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingCreativeWorksTableError();
    throw error;
  }

  return toCreativeWork(data as CreativeWorkRow);
}

export async function getCreativeWorkById(
  id: string,
): Promise<CreativeWork | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("creative_works")
    .select("*")
    .eq("id", id)
    .eq("user_id", USER_ID)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) throw new MissingCreativeWorksTableError();
    throw error;
  }

  return data ? toCreativeWork(data as CreativeWorkRow) : null;
}

export interface ListCreativeWorksOptions {
  status?: CreativeWorkStatus;
}

export async function listCreativeWorks(
  options: ListCreativeWorksOptions = {},
): Promise<CreativeWork[]> {
  const supabase = getSupabaseServerClient();

  let query = supabase.from("creative_works").select("*").eq("user_id", USER_ID);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) throw new MissingCreativeWorksTableError();
    throw error;
  }

  return (data ?? []).map(toCreativeWork);
}

export interface UpdateCreativeWorkInput {
  status?: CreativeWorkStatus;
  reflection?: string;
  package?: CreativeWorkPackage;
  generatedAt?: string;
  postedAt?: string;
}

// Deliberately generic, mirroring updateMemory's shape — the caller decides
// which fields to set and when (e.g. whether posting a status update should
// also stamp postedAt). No AI/generation orchestration lives here.
export async function updateCreativeWork(
  id: string,
  input: UpdateCreativeWorkInput,
): Promise<CreativeWork> {
  const supabase = getSupabaseServerClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status) patch.status = input.status;
  if (input.reflection !== undefined) patch.reflection = input.reflection;
  if (input.package !== undefined) patch.package = input.package;
  if (input.generatedAt !== undefined) patch.generated_at = input.generatedAt;
  if (input.postedAt !== undefined) patch.posted_at = input.postedAt;

  const { data, error } = await supabase
    .from("creative_works")
    .update(patch)
    .eq("id", id)
    .eq("user_id", USER_ID)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingCreativeWorksTableError();
    throw error;
  }

  return toCreativeWork(data as CreativeWorkRow);
}

export async function deleteCreativeWork(id: string): Promise<void> {
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("creative_works")
    .delete()
    .eq("id", id)
    .eq("user_id", USER_ID);

  if (error) {
    if (isMissingTableError(error)) throw new MissingCreativeWorksTableError();
    throw error;
  }
}

export async function findCreativeWorkByOrigin(
  originType: CreativeWorkOriginType,
  originId: string,
  platform: Platform,
): Promise<CreativeWork | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("creative_works")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("origin_type", originType)
    .eq("origin_id", originId)
    .eq("platform", platform)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) throw new MissingCreativeWorksTableError();
    throw error;
  }

  return data ? toCreativeWork(data as CreativeWorkRow) : null;
}
