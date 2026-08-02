import {
  deleteTask,
  getTaskById,
  MissingTasksTableError,
  updateTask,
} from "@/lib/echo/tasks/repository";
import { formatError } from "@/lib/echo/errors";
import { RESPONSIBILITY_AREAS } from "@/lib/echo/types";
import type { TaskEnergyLevel, TaskPriority, TaskStatus } from "@/lib/echo/types";

// No Anthropic import anywhere in this file.

const STATUSES: TaskStatus[] = ["open", "done"];
const LEVELS: (TaskEnergyLevel | TaskPriority)[] = ["low", "medium", "high"];

function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

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
    const body = (await request.json()) as Record<string, unknown>;

    const title =
      typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined;
    const description =
      body.description === null
        ? null
        : typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : undefined;
    const responsibilityArea = pickEnum(body.responsibilityArea, RESPONSIBILITY_AREAS);
    const status = pickEnum(body.status, STATUSES);
    const dueAt =
      body.dueAt === null ? null : typeof body.dueAt === "string" && body.dueAt ? body.dueAt : undefined;
    const estimatedMinutes =
      typeof body.estimatedMinutes === "number" && Number.isFinite(body.estimatedMinutes)
        ? body.estimatedMinutes
        : undefined;
    const energyRequired = pickEnum(body.energyRequired, LEVELS) as TaskEnergyLevel | undefined;
    const priority = pickEnum(body.priority, LEVELS) as TaskPriority | undefined;
    const deepWork = typeof body.deepWork === "boolean" ? body.deepWork : undefined;

    if (
      !title &&
      description === undefined &&
      !responsibilityArea &&
      !status &&
      dueAt === undefined &&
      estimatedMinutes === undefined &&
      !energyRequired &&
      !priority &&
      deepWork === undefined
    ) {
      return Response.json({ error: "No valid fields to update." }, { status: 400 });
    }

    // completedAt is derived here, not left to the client — stamped when
    // entering "done" only if not already set (so a redundant PATCH doesn't
    // overwrite the original completion time), cleared when reopened.
    let completedAt: string | null | undefined;
    if (status === "done" || status === "open") {
      const current = await getTaskById(id);
      if (!current) {
        return Response.json({ error: "Task not found." }, { status: 404 });
      }
      completedAt = status === "done" ? (current.completedAt ?? new Date().toISOString()) : null;
    }

    const task = await updateTask(id, {
      title,
      description,
      responsibilityArea,
      status,
      dueAt,
      estimatedMinutes,
      energyRequired,
      priority,
      deepWork,
      completedAt,
    });

    return Response.json({ task });
  } catch (error) {
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
