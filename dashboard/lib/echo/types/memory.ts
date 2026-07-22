export type MemoryCategory =
  | "identity"
  | "preference"
  | "goal"
  | "project"
  | "relationship"
  | "routine"
  | "creator-style"
  | "constraint"
  | "other";

export type MemoryImportance = "low" | "medium" | "high";

// "high" confidence = Sebastián stated this directly. "medium"/"low" = Echo
// inferred it — see docs/echo-constitution.md Rule 9 (evidence vs. inference).
export type MemoryConfidence = "low" | "medium" | "high";

export type MemorySourceType = "chat" | "thought" | "import" | "manual";

// "superseded" (not deleted) is how a memory is replaced when new
// information contradicts it — the old row stays for history.
export type MemoryStatus = "active" | "superseded" | "archived";

export interface Memory {
  id: string;
  userId: string;
  category: MemoryCategory;
  // Short topic label (e.g. "Morning filming preference") — doubles as the
  // matching key extraction uses to detect when new information conflicts
  // with an existing memory on the same topic.
  title: string;
  // One factual note in Echo's voice, present-tense ("Sebastián prefers
  // ..."), not a narrated retelling of the conversation that produced it.
  description: string;
  importance: MemoryImportance;
  confidence: MemoryConfidence;
  sourceType: MemorySourceType;
  sourceMessageId: string | null;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}
