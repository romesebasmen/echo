import {
  deleteTask,
  getTaskById,
  MissingTasksTableError,
  updateTask,
} from "@/lib/echo/tasks/repository";
import { formatError } from "@/lib/echo/errors";
import {
  InvalidTaskRequestError,
  parseTaskUpdateRequest,
} from "@/lib/echo/tasks/request";

// No Anthropic import anywhere in this file.

function handleTasksError(routeLabel: string, error: unknown) {
  if (error instanceof MissingTasksTableError) {
    console.error(`${routeLabel} failed: tasks table is missing.`);
    return Response.json(
      { error: "The tasks table doesn't exist yet. Run the setup SQL, then try again." },
      { status: 500 },
    );
  }

  console.error(`${routeLabel} failed:`, formatError(error));
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const input = parseTaskUpdateRequest(body);

    // completedAt is derived here, not left to the client — stamped when
    // entering "done" only if not already set (so a redundant PATCH doesn't
    // overwrite the original completion time), cleared when reopened.
    let completedAt: string | null | undefined;
    if (input.status === "done" || input.status === "open") {
      const current = await getTaskById(id);
      if (!current) {
        return Response.json({ error: "Task not found." }, { status: 404 });
      }
      completedAt = input.status === "done" ? (current.completedAt ?? new Date().toISOString()) : null;
    }

    const task = await updateTask(id, {
      ...input,
      completedAt,
    });

    return Response.json({ task });
  } catch (error) {
    if (error instanceof InvalidTaskRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return handleTasksError("PATCH /api/tasks/[id]", error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteTask(id);
    return Response.json({ ok: true });
  } catch (error) {
    return handleTasksError("DELETE /api/tasks/[id]", error);
  }
}
