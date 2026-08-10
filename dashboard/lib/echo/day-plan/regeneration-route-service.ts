import { claudeDayPlanRecommendationProvider } from "@/lib/echo/ai/claude-day-plan-regeneration";
import {
  applyDayPlanRegeneration,
  proposeDayPlanRegenerationWithContext,
  StaleDayPlanRegenerationProposalError,
} from "@/lib/echo/day-plan/regeneration-service";
import {
  getDayPlanForDate,
  listCommitments,
} from "@/lib/echo/day-plan/repository";
import {
  CheckInChangedDuringGenerationError,
  persistGeneratedSchedule,
} from "@/lib/echo/day-plan/schedule-blocks-repository";
import { listTasks } from "@/lib/echo/tasks/repository";
import { toUserDateString } from "@/lib/echo/timezone";
import { createAiOperationKey } from "@/lib/echo/ai/operation-lease";
import { runWithAiOperationLease } from "@/lib/echo/ai/operation-lease-server";

// SERVER-ONLY route wiring. The Claude provider remains lazy and is only
// invoked by proposeDayPlanRegenerationWithContext when open tasks exist.

export function proposeTodaysDayPlanRegeneration(
  expectedCheckInCompletedAt: string,
) {
  const planDate = toUserDateString(new Date());
  return runWithAiOperationLease(
    createAiOperationKey("day-plan-regeneration", planDate),
    () =>
      proposeDayPlanRegenerationWithContext(
        planDate,
        expectedCheckInCompletedAt,
        {
          getDayPlanForDate,
          listTasks,
          listCommitments,
          provider: claudeDayPlanRecommendationProvider,
        },
      ),
  );
}

export function applyTodaysDayPlanRegeneration(request: unknown) {
  return applyDayPlanRegeneration(toUserDateString(new Date()), request, {
    getDayPlanForDate,
    listTasks,
    listCommitments,
    async persistGeneratedSchedule(
      dayPlanId,
      expectedCheckInCompletedAt,
      blocks,
    ) {
      try {
        return await persistGeneratedSchedule(
          dayPlanId,
          expectedCheckInCompletedAt,
          blocks,
        );
      } catch (error) {
        if (error instanceof CheckInChangedDuringGenerationError) {
          throw new StaleDayPlanRegenerationProposalError("check-in-changed");
        }
        throw error;
      }
    },
  });
}
