import {
  createTask,
  listTasks,
  MissingTasksTableError,
} from "@/lib/echo/tasks/repository";
import { formatError } from "@/lib/echo/errors";
import { RESPONSIBILITY_AREAS } from "@/lib/echo/types";
import type {
  ResponsibilityArea,
  TaskEnergyLevel,
  TaskPriority,
  TaskStatus,
} from "@/lib/echo/types";

// No Anthropic import anywhere in this file — listing and creating tasks
// are pure Supabase reads/writes.

const STATUSES: TaskStatus[] = ["open", "done"];
const LEVELS: (TaskEnergyLevel | TaskPriority)[] = ["low", "medium", "high"];

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");

    if (statusParam && !STATUSES.includes(statusParam as TaskStatus)) {
      return Response.json({ error: "Invalid status filter." }, { status: 400 });
    }

    const tasks = await listTasks({
      status: statusParam ? (statusParam as TaskStatus) : undefined,
    });

    return Response.json({ tasks });
  } catch (error) {
    return handleTasksError("GET /api/tasks", error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const responsibilityArea =
      typeof body.responsibilityArea === "string" &&
      RESPONSIBILITY_AREAS.includes(body.responsibilityArea as ResponsibilityArea)
        ? (body.responsibilityArea as ResponsibilityArea)
        : undefined;

    if (!title) {
      return Response.json({ error: "title is required." }, { status: 400 });
    }
    if (!responsibilityArea) {
      return Response.json({ error: "A valid responsibilityArea is required." }, { status: 400 });
    }

    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const dueAt = typeof body.dueAt === "string" && body.dueAt ? body.dueAt : null;
    const estimatedMinutes =
      typeof body.estimatedMinutes === "number" && Number.isFinite(body.estimatedMinutes)
        ? body.estimatedMinutes
        : null;
    const energyRequired =
      typeof body.energyRequired === "string" &&
      LEVELS.includes(body.energyRequired as TaskEnergyLevel)
        ? (body.energyRequired as TaskEnergyLevel)
        : undefined;
    const priority =
      typeof body.priority === "string" && LEVELS.includes(body.priority as TaskPriority)
        ? (body.priority as TaskPriority)
        : undefined;
    const deepWork = typeof body.deepWork === "boolean" ? body.deepWork : undefined;

    const task = await createTask({
      responsibilityArea,
      title,
      description,
      dueAt,
      estimatedMinutes,
      energyRequired,
      priority,
      deepWork,
    });

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return handleTasksError("POST /api/tasks", error);
  }
}
