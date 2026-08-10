import { formatUserTime } from "../timezone.ts";
import type { ScheduleBlock, ScheduleBlockSourceType } from "../types/day-plan.ts";

const BLOCK_KIND_LABELS: Record<ScheduleBlockSourceType, string> = {
  task: "Task",
  commitment: "Commitment",
  break: "Break",
};

export interface ScheduleBlockPresentation {
  kindLabel: string;
  timeRange: string;
}

export type ScheduleStepTiming = "now" | "next" | "needs-attention";

export function presentScheduleBlock(block: ScheduleBlock): ScheduleBlockPresentation {
  return {
    kindLabel: BLOCK_KIND_LABELS[block.sourceType],
    timeRange: `${formatUserTime(new Date(block.startTime))}–${formatUserTime(
      new Date(block.endTime),
    )}`,
  };
}

export function scheduleStepTiming(
  block: ScheduleBlock,
  now: Date,
): ScheduleStepTiming {
  const nowMs = now.getTime();
  const startMs = new Date(block.startTime).getTime();
  const endMs = new Date(block.endTime).getTime();

  if (startMs <= nowMs && nowMs < endMs) return "now";
  if (startMs > nowMs) return "next";
  return "needs-attention";
}
