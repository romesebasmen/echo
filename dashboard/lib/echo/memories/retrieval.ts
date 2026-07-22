import { listMemories, touchLastUsed } from "@/lib/echo/memories/repository";
import type { Memory } from "@/lib/echo/types";

// v1 "relevance" is importance-then-recency ordering (done in the
// repository query), not embeddings/semantic search — see the memory
// system report for why. Retrieved memories are marked as used so
// last_used_at reflects real usage over time.
export async function getRelevantMemories(limit: number): Promise<Memory[]> {
  const memories = await listMemories({ status: "active", limit });
  if (memories.length > 0) {
    await touchLastUsed(memories.map((memory) => memory.id));
  }
  return memories;
}

export function formatMemoriesForPrompt(memories: Memory[]): string {
  if (memories.length === 0) {
    return "(no stored memories yet)";
  }

  return memories
    .map(
      (memory) =>
        `- [${memory.category}, ${memory.importance} importance, ${memory.confidence} confidence] ${memory.title}: ${memory.description}`,
    )
    .join("\n");
}
