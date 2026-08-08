import { createProposeDayPlanRegenerationHandler } from "@/lib/echo/day-plan/regeneration-http";
import { proposeTodaysDayPlanRegeneration } from "@/lib/echo/day-plan/regeneration-route-service";

export const POST = createProposeDayPlanRegenerationHandler({
  propose: proposeTodaysDayPlanRegeneration,
});
