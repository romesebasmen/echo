"use client";

import { useId, useState, type FormEvent } from "react";
import { useTasks } from "@/lib/echo/tasks/useTasks";
import {
  RESPONSIBILITY_AREAS,
  RESPONSIBILITY_AREA_LABELS,
} from "@/lib/echo/types";
import type {
  ResponsibilityArea,
  TaskEnergyLevel,
  TaskPriority,
} from "@/lib/echo/types";
import {
  MAX_TASK_ESTIMATED_MINUTES,
  MAX_TASK_TITLE_LENGTH,
  MIN_TASK_ESTIMATED_MINUTES,
} from "@/lib/echo/tasks/request";

const LEVELS: (TaskEnergyLevel | TaskPriority)[] = ["low", "medium", "high"];

const inputClassName =
  "rounded-md border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-accent";
const selectClassName =
  "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent";

export function TasksPanel() {
  const { tasks, isLoading, isSaving, error, createTask, toggleDone, deleteTask } = useTasks();

  const [title, setTitle] = useState("");
  const [responsibilityArea, setResponsibilityArea] = useState<ResponsibilityArea>("echo");
  const [dueAt, setDueAt] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [energyRequired, setEnergyRequired] = useState<TaskEnergyLevel>("medium");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [deepWork, setDeepWork] = useState(false);

  const titleId = useId();
  const areaId = useId();
  const dueId = useId();
  const minutesId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const success = await createTask({
      title: trimmedTitle,
      responsibilityArea,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      energyRequired,
      priority,
      deepWork,
    });

    if (success) {
      setTitle("");
      setDueAt("");
      setEstimatedMinutes("");
      setEnergyRequired("medium");
      setPriority("medium");
      setDeepWork(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-accent">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={titleId} className="text-sm text-muted">
            Task
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={MAX_TASK_TITLE_LENGTH}
            className={inputClassName}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={areaId} className="text-sm text-muted">
              Responsibility area
            </label>
            <select
              id={areaId}
              value={responsibilityArea}
              onChange={(event) =>
                setResponsibilityArea(event.target.value as ResponsibilityArea)
              }
              className={selectClassName}
            >
              {RESPONSIBILITY_AREAS.map((area) => (
                <option key={area} value={area}>
                  {RESPONSIBILITY_AREA_LABELS[area]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={dueId} className="text-sm text-muted">
              Due (optional)
            </label>
            <input
              id={dueId}
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className={inputClassName}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={minutesId} className="text-sm text-muted">
              Est. minutes
            </label>
            <input
              id={minutesId}
              type="number"
              min={MIN_TASK_ESTIMATED_MINUTES}
              max={MAX_TASK_ESTIMATED_MINUTES}
              step={1}
              value={estimatedMinutes}
              onChange={(event) => setEstimatedMinutes(event.target.value)}
              className={inputClassName}
            />
          </div>

          <select
            value={energyRequired}
            onChange={(event) => setEnergyRequired(event.target.value as TaskEnergyLevel)}
            aria-label="Energy required"
            className={selectClassName}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} energy
              </option>
            ))}
          </select>

          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
            aria-label="Priority"
            className={selectClassName}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} priority
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={deepWork}
              onChange={(event) => setDeepWork(event.target.checked)}
            />
            Deep work
          </label>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="self-start rounded-md border border-foreground px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Add task"}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted">No tasks yet — add one above.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start justify-between gap-4 py-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-muted">
                  {RESPONSIBILITY_AREA_LABELS[task.responsibilityArea]} · {task.priority} priority ·{" "}
                  {task.energyRequired} energy
                  {task.deepWork ? " · deep work" : ""}
                </span>
                <h3
                  className={`text-base font-medium ${
                    task.status === "done" ? "text-muted line-through" : "text-foreground"
                  }`}
                >
                  {task.title}
                </h3>
                {task.dueAt && (
                  <p className="text-sm text-muted">
                    Due {new Date(task.dueAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => toggleDone(task)}
                  className="text-sm text-muted transition-colors hover:text-accent"
                >
                  {task.status === "done" ? "Reopen" : "Complete"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  aria-label={`Delete task: ${task.title}`}
                  className="text-sm text-muted transition-colors hover:text-accent"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
