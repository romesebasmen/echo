import {
  createTask,
  listTasks,
  MissingTasksTableError,
} from "@/lib/echo/tasks/repository";
import { formatError } from "@/lib/echo/errors";
import {
  InvalidTaskRequestError,
  parseTaskCreateRequest,
} from "@/lib/echo/tasks/request";
import type { TaskStatus } from "@/lib/echo/types";

// No Anthropic import anywhere in this file — listing and creating tasks
// are pure Supabase reads/writes.

const STATUSES: TaskStatus[] = ["open", "done"];
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const input = parseTaskCreateRequest(body);
    const task = await createTask(input);

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidTaskRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return handleTasksError("POST /api/tasks", error);
  }
}
