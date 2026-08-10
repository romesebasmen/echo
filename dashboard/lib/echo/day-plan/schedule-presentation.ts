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

export function presentScheduleBlock(block: ScheduleBlock): ScheduleBlockPresentation {
  return {
    kindLabel: BLOCK_KIND_LABELS[block.sourceType],
    timeRange: `${formatUserTime(new Date(block.startTime))}–${formatUserTime(
      new Date(block.endTime),
    )}`,
  };
}
