import type {
  ExistingMemoryContext,
  MemoryExtractionInput,
  MemoryOperation,
} from "../ai/claude-memory-extraction.ts";
import { createAiOperationKey } from "../ai/operation-lease.ts";

export interface MemoryExtractionWorkflowInput {
  userMessage: string;
  echoReply: string;
  sourceMessageId: string;
}

export interface MemoryExtractionWorkflowDependencies {
  runExclusive: <T>(operationKey: string, operation: () => Promise<T>) => Promise<T>;
  hasCompleted: (sourceMessageId: string) => Promise<boolean>;
  listActiveMemories: () => Promise<ExistingMemoryContext[]>;
  extract: (input: MemoryExtractionInput) => Promise<MemoryOperation[]>;
  applyAtomically: (
    sourceMessageId: string,
    operations: readonly MemoryOperation[],
  ) => Promise<number>;
}

export function createMemoryExtractionWorkflow(
  dependencies: MemoryExtractionWorkflowDependencies,
): (input: MemoryExtractionWorkflowInput) => Promise<number> {
  return async function extractAndApplyMemories(input) {
    return dependencies.runExclusive(
      createAiOperationKey("memory-extraction", input.sourceMessageId),
      async () => {
        // This check runs inside the cross-instance lease. A completed chat
        // turn never incurs another provider call, even if background work is
        // delivered more than once.
        if (await dependencies.hasCompleted(input.sourceMessageId)) {
          return 0;
        }

        const existingMemories = await dependencies.listActiveMemories();
        const operations = await dependencies.extract({
          userMessage: input.userMessage,
          echoReply: input.echoReply,
          existingMemories,
        });

        return dependencies.applyAtomically(input.sourceMessageId, operations);
      },
    );
  };
}
