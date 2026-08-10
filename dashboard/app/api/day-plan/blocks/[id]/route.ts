import { loadCurrentDayPlanState } from "@/lib/echo/day-plan/current-state";
import {
  getDayPlanForDate,
  MissingDayPlansTableError,
} from "@/lib/echo/day-plan/repository";
import {
  InvalidScheduleBlockActionRequestError,
  parseScheduleBlockId,
  parseScheduleBlockActionRequest,
} from "@/lib/echo/day-plan/schedule-block-action";
import {
  InvalidScheduleBlockTransitionError,
  listScheduleBlocks,
  MissingScheduleBlockActionMigrationError,
  MissingScheduleBlocksTableError,
  ScheduleBlockNotFoundError,
  transitionScheduleTaskBlock,
} from "@/lib/echo/day-plan/schedule-blocks-repository";
import { formatError } from "@/lib/echo/errors";
import { listTasks, MissingTasksTableError } from "@/lib/echo/tasks/repository";
import { toUserDateString } from "@/lib/echo/timezone";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const id = parseScheduleBlockId(rawId);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const { status } = parseScheduleBlockActionRequest(body);

    await transitionScheduleTaskBlock(id, status);

    const state = await loadCurrentDayPlanState(toUserDateString(new Date()), {
      getDayPlanForDate,
      listScheduleBlocks,
      listTasks,
    });
    return Response.json(state);
  } catch (error) {
    if (error instanceof InvalidScheduleBlockActionRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ScheduleBlockNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidScheduleBlockTransitionError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof MissingScheduleBlockActionMigrationError) {
      console.error("PATCH /api/day-plan/blocks/[id] failed: action migration is missing.");
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (
      error instanceof MissingDayPlansTableError ||
      error instanceof MissingScheduleBlocksTableError ||
      error instanceof MissingTasksTableError
    ) {
      console.error("PATCH /api/day-plan/blocks/[id] failed: planning table is missing.");
      return Response.json(
        { error: "A required planning table is missing. Run the setup SQL, then try again." },
        { status: 500 },
      );
    }

    console.error("PATCH /api/day-plan/blocks/[id] failed:", formatError(error));
    return Response.json({ error: "Could not update the schedule block." }, { status: 500 });
  }
}
