import { createApplyDayPlanRegenerationHandler } from "@/lib/echo/day-plan/regeneration-http";
import { applyTodaysDayPlanRegeneration } from "@/lib/echo/day-plan/regeneration-route-service";

export const POST = createApplyDayPlanRegenerationHandler({
  apply: applyTodaysDayPlanRegeneration,
});
