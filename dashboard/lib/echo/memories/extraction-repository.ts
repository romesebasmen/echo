import { getSupabaseServerClient } from "../supabase/server-client.ts";
import type { MemoryOperation } from "../ai/claude-memory-extraction.ts";

export class MemoryExtractionPersistenceError extends Error {
  readonly code: string | null;

  constructor(code: string | null = null) {
    super("Echo could not atomically persist memory extraction.");
    this.name = "MemoryExtractionPersistenceError";
    this.code = code;
  }
}

interface PostgrestErrorLike {
  code?: string;
}

export type MemoryExtractionRpcCaller = (
  functionName: string,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: PostgrestErrorLike | null }>;

function safeErrorCode(error: PostgrestErrorLike): string | null {
  return typeof error.code === "string" && /^[A-Z0-9]{2,10}$/.test(error.code)
    ? error.code
    : null;
}

export async function hasCompletedMemoryExtraction(
  sourceMessageId: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseServerClient()
    .from("memory_extraction_runs")
    .select("source_message_id")
    .eq("source_message_id", sourceMessageId)
    .maybeSingle();

  if (error) {
    throw new MemoryExtractionPersistenceError(safeErrorCode(error));
  }
  return data !== null;
}

export async function applyMemoryOperationsAtomically(
  sourceMessageId: string,
  operations: readonly MemoryOperation[],
  callRpc: MemoryExtractionRpcCaller = async (functionName, parameters) => {
    const { data, error } = await getSupabaseServerClient().rpc(
      functionName,
      parameters,
    );
    return { data, error };
  },
): Promise<number> {
  const { data, error } = await callRpc("apply_memory_extraction", {
    p_source_message_id: sourceMessageId,
    p_operations: operations,
  });

  if (error) {
    throw new MemoryExtractionPersistenceError(safeErrorCode(error));
  }
  if (!Number.isInteger(data) || (data as number) < 0 || (data as number) > 10) {
    throw new MemoryExtractionPersistenceError();
  }
  return data as number;
}
