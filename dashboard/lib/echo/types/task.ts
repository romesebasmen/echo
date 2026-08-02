import type { ResponsibilityArea } from "@/lib/echo/types/responsibility-area";

export type TaskStatus = "open" | "done";
export type TaskEnergyLevel = "low" | "medium" | "high";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  userId: string;
  responsibilityArea: ResponsibilityArea;
  title: string;
  description: string | null;
  status: TaskStatus;
  // ISO timestamp. Day-boundary comparisons against this must go through
  // lib/echo/timezone.ts, never raw Date arithmetic.
  dueAt: string | null;
  estimatedMinutes: number | null;
  energyRequired: TaskEnergyLevel;
  priority: TaskPriority;
  deepWork: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
