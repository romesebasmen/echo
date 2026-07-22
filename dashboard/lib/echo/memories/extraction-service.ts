import { extractMemoryOperations } from "@/lib/echo/ai/claude-memory-extraction";
import { createMemory, listMemories, updateMemory } from "@/lib/echo/memories/repository";
import type { MemorySourceType } from "@/lib/echo/types";

export interface ExtractAndApplyInput {
  userMessage: string;
  echoReply: string;
  sourceMessageId: string | null;
  sourceType: MemorySourceType;
}

// Runs after a chat exchange completes. Never throws to the caller by
// design (see the try/catch this is invoked from) — a failure here must
// never affect the chat response itself.
export async function extractAndApplyMemories(
  input: ExtractAndApplyInput,
): Promise<number> {
  const existing = await listMemories({ status: "active", limit: 50 });

  const operations = await extractMemoryOperations({
    userMessage: input.userMessage,
    echoReply: input.echoReply,
    existingMemories: existing.map((memory) => ({
      id: memory.id,
      category: memory.category,
      title: memory.title,
      description: memory.description,
    })),
  });

  let appliedCount = 0;

  for (const operation of operations) {
    if (operation.action === "create") {
      await createMemory({
        category: operation.category,
        title: operation.title,
        description: operation.description,
        importance: operation.importance,
        confidence: operation.confidence,
        sourceType: input.sourceType,
        sourceMessageId: input.sourceMessageId,
      });
      appliedCount += 1;
      continue;
    }

    if (!operation.targetMemoryId) {
      continue;
    }

    if (operation.action === "update") {
      await updateMemory(operation.targetMemoryId, {
        category: operation.category,
        title: operation.title,
        description: operation.description,
        importance: operation.importance,
        confidence: operation.confidence,
      });
      appliedCount += 1;
      continue;
    }

    // "supersede": the old memory is kept but marked no longer current,
    // and the replacement is created as its own active memory.
    await updateMemory(operation.targetMemoryId, { status: "superseded" });
    await createMemory({
      category: operation.category,
      title: operation.title,
      description: operation.description,
      importance: operation.importance,
      confidence: operation.confidence,
      sourceType: input.sourceType,
      sourceMessageId: input.sourceMessageId,
    });
    appliedCount += 1;
  }

  return appliedCount;
}
