export type MemoryCategory = "preference" | "goal" | "pattern" | "fact";

export type MemoryImportance = "low" | "medium" | "high";

export interface Memory {
  id: string;
  userId: string;
  category: MemoryCategory;
  content: string;
  importance: MemoryImportance;
  source: string;
  createdAt: string;
}
