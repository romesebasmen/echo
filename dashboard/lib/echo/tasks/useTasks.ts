import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ResponsibilityArea,
  Task,
  TaskEnergyLevel,
  TaskPriority,
  TaskStatus,
} from "@/lib/echo/types";
import {
  hasResponseField,
  parseJsonResponse,
} from "@/lib/echo/client/json-response";
import { runExclusiveClientOperation } from "@/lib/echo/client/operation-gate";

export interface CreateTaskInput {
  title: string;
  responsibilityArea: ResponsibilityArea;
  description?: string;
  dueAt?: string;
  estimatedMinutes?: number | null;
  energyRequired?: TaskEnergyLevel;
  priority?: TaskPriority;
  deepWork?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  responsibilityArea?: ResponsibilityArea;
  description?: string | null;
  status?: TaskStatus;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  energyRequired?: TaskEnergyLevel;
  priority?: TaskPriority;
  deepWork?: boolean;
}

interface TasksResponse {
  tasks: Task[];
}

interface TaskResponse {
  task: Task;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

async function parseTasksResponse(response: Response): Promise<TasksResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is TasksResponse =>
      hasResponseField(body, "tasks") && Array.isArray(body.tasks),
  });
}

async function parseTaskResponse(response: Response): Promise<TaskResponse> {
  return parseJsonResponse(response, {
    fallbackMessage: GENERIC_ERROR,
    isSuccessBody: (body): body is TaskResponse =>
      hasResponseField(body, "task") &&
      typeof body.task === "object" &&
      body.task !== null,
  });
}

export function useTasks() {
  const mutationGate = useRef({ busy: false });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks");
      const body = await parseTasksResponse(response);
      setTasks(body.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tasks. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching data on mount is a legitimate use of an Effect (React docs,
    // "You Might Not Need an Effect" -> "Fetching data"); the setState calls
    // happen after the request resolves, not synchronously in this body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function createTask(input: CreateTaskInput): Promise<boolean> {
    const result = await runExclusiveClientOperation(
      mutationGate.current,
      async () => {
        setError(null);
        setIsSaving(true);
        try {
          const response = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const body = await parseTaskResponse(response);
          setTasks((previous) => [body.task, ...previous]);
          return true;
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not create the task. Please try again.",
          );
          return false;
        } finally {
          setIsSaving(false);
        }
      },
    );
    return result.executed ? result.value : false;
  }

  async function updateTask(id: string, input: UpdateTaskInput): Promise<boolean> {
    const result = await runExclusiveClientOperation(
      mutationGate.current,
      async () => {
        setError(null);
        setIsSaving(true);
        try {
          const response = await fetch(`/api/tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          const body = await parseTaskResponse(response);
          setTasks((previous) =>
            previous.map((task) => (task.id === id ? body.task : task)),
          );
          return true;
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not update the task. Please try again.",
          );
          return false;
        } finally {
          setIsSaving(false);
        }
      },
    );
    return result.executed ? result.value : false;
  }

  async function toggleDone(task: Task): Promise<boolean> {
    return updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
  }

  async function deleteTask(id: string): Promise<void> {
    await runExclusiveClientOperation(mutationGate.current, async () => {
      setError(null);
      setIsSaving(true);
      const previous = tasks;
      setTasks((current) => current.filter((task) => task.id !== id));
      try {
        const response = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(GENERIC_ERROR);
      } catch (err) {
        setTasks(previous);
        setError(
          err instanceof Error
            ? err.message
            : "Could not delete the task. Please try again.",
        );
      } finally {
        setIsSaving(false);
      }
    });
  }

  return {
    tasks,
    isLoading,
    isSaving,
    error,
    createTask,
    updateTask,
    toggleDone,
    deleteTask,
  };
}
