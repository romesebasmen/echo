import { extractMemoryOperations } from "@/lib/echo/ai/claude-memory-extraction";
import { listMemories } from "@/lib/echo/memories/repository";
import { runWithAiOperationLease } from "@/lib/echo/ai/operation-lease-server";
import { createMemoryExtractionWorkflow } from "@/lib/echo/memories/extraction-workflow";
import {
  applyMemoryOperationsAtomically,
  hasCompletedMemoryExtraction,
} from "@/lib/echo/memories/extraction-repository";

export interface ExtractAndApplyInput {
  userMessage: string;
  echoReply: string;
  sourceMessageId: string;
}

// Runs after a chat exchange completes. Never throws to the caller by
// design (see the try/catch this is invoked from) — a failure here must
// never affect the chat response itself.
const runMemoryExtraction = createMemoryExtractionWorkflow({
  runExclusive: runWithAiOperationLease,
  hasCompleted: hasCompletedMemoryExtraction,
  async listActiveMemories() {
    const existing = await listMemories({ status: "active", limit: 50 });
    return existing.map((memory) => ({
      id: memory.id,
      category: memory.category,
      title: memory.title,
      description: memory.description,
    }));
  },
  extract: extractMemoryOperations,
  applyAtomically: applyMemoryOperationsAtomically,
});

export async function extractAndApplyMemories(
  input: ExtractAndApplyInput,
): Promise<number> {
  return runMemoryExtraction(input);
}
