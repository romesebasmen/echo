import { useCallback, useEffect, useState } from "react";
import type {
  ResponsibilityArea,
  Task,
  TaskEnergyLevel,
  TaskPriority,
  TaskStatus,
} from "@/lib/echo/types";

export interface CreateTaskInput {
  title: string;
  responsibilityArea: ResponsibilityArea;
  description?: string;
  dueAt?: string;
  estimatedMinutes?: number;
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
  estimatedMinutes?: number;
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

interface ErrorResponse {
  error: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks");
      const body = (await response.json()) as TasksResponse | ErrorResponse;
      if (!response.ok || !("tasks" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
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
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as TaskResponse | ErrorResponse;
      if (!response.ok || !("task" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
      setTasks((previous) => [body.task, ...previous]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTask(id: string, input: UpdateTaskInput): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as TaskResponse | ErrorResponse;
      if (!response.ok || !("task" in body)) {
        throw new Error("error" in body ? body.error : GENERIC_ERROR);
      }
      setTasks((previous) => previous.map((task) => (task.id === id ? body.task : task)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleDone(task: Task): Promise<boolean> {
    return updateTask(task.id, { status: task.status === "done" ? "open" : "done" });
  }

  async function deleteTask(id: string): Promise<void> {
    setError(null);
    const previous = tasks;
    setTasks((current) => current.filter((task) => task.id !== id));
    try {
      const response = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(GENERIC_ERROR);
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Could not delete the task. Please try again.");
    }
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
