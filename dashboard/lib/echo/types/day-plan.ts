import type { ResponsibilityArea } from "@/lib/echo/types/responsibility-area";
import type { SleepQuality } from "@/lib/echo/types/planning-context";

export type ScheduleBlockSourceType = "task" | "commitment" | "break";
export type ScheduleBlockStatus = "scheduled" | "completed" | "skipped";

export interface ScheduleBlock {
  id: string;
  dayPlanId: string;
  sourceType: ScheduleBlockSourceType;
  // Polymorphic (points into tasks depending on sourceType), no DB-level FK
  // — same pattern as creative_works.originId. Null for "commitment" and
  // "break".
  sourceId: string | null;
  title: string;
  responsibilityArea: ResponsibilityArea | null;
  startTime: string;
  endTime: string;
  status: ScheduleBlockStatus;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface Commitment {
  id: string;
  dayPlanId: string;
  title: string;
  startTime: string;
  endTime: string;
  responsibilityArea: ResponsibilityArea | null;
  createdAt: string;
}

export type DayPlanStatus = "setup" | "generated";

export interface DayPlan {
  id: string;
  userId: string;
  // "YYYY-MM-DD" in the user's timezone (lib/echo/timezone.ts), not UTC.
  planDate: string;
  // Renamed from "wake-up time" — defaults to the current time when a plan
  // is created mid-day rather than always assuming a fresh morning.
  availableFrom: string;
  energy: number;
  stress: number | null;
  sleepQuality: SleepQuality | null;
  hasEaten: boolean | null;
  checkInNotes: string | null;
  checkInCompletedAt: string | null;
  endOfWorkTime: string;
  status: DayPlanStatus;
  createdAt: string;
  updatedAt: string;
}
