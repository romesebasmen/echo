import {
  deleteCommitment,
  getDayPlanForDate,
  listCommitments,
} from "@/lib/echo/day-plan/repository";
import { parseCommitmentId } from "@/lib/echo/day-plan/commitment-request";
import { handleCommitmentHttpError } from "@/lib/echo/day-plan/commitment-http";
import { loadCurrentDayPlanState } from "@/lib/echo/day-plan/current-state";
import { listScheduleBlocks } from "@/lib/echo/day-plan/schedule-blocks-repository";
import { listTasks } from "@/lib/echo/tasks/repository";
import { toUserDateString } from "@/lib/echo/timezone";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeLabel = "DELETE /api/day-plan/commitments/[id]";
  try {
    const { id: rawId } = await params;
    const commitmentId = parseCommitmentId(rawId);
    const planDate = toUserDateString(new Date());
    const dayPlan = await getDayPlanForDate(planDate);
    if (!dayPlan) {
      return Response.json(
        { error: "Today's day plan was not found." },
        { status: 404 },
      );
    }

    await deleteCommitment(dayPlan.id, commitmentId);
    const state = await loadCurrentDayPlanState(planDate, {
      getDayPlanForDate,
      listCommitments,
      listScheduleBlocks,
      listTasks,
    });
    return Response.json(state);
  } catch (error) {
    return handleCommitmentHttpError(routeLabel, error);
  }
}
