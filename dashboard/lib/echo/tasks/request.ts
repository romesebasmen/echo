import { parseTimestampWithExplicitOffset } from "../timezone.ts";
import {
  RESPONSIBILITY_AREAS,
  type ResponsibilityArea,
} from "../types/responsibility-area.ts";
import type {
  TaskEnergyLevel,
  TaskPriority,
  TaskStatus,
} from "../types/task.ts";

export const MAX_TASK_TITLE_LENGTH = 200;
export const MAX_TASK_DESCRIPTION_LENGTH = 4_000;
export const MIN_TASK_ESTIMATED_MINUTES = 1;
export const MAX_TASK_ESTIMATED_MINUTES = 1_440;

const TASK_LEVELS = ["low", "medium", "high"] as const;
const TASK_STATUSES = ["open", "done"] as const;
const CREATE_FIELDS = new Set([
  "title",
  "responsibilityArea",
  "description",
  "dueAt",
  "estimatedMinutes",
  "energyRequired",
  "priority",
  "deepWork",
]);
const UPDATE_FIELDS = new Set([...CREATE_FIELDS, "status"]);

export class InvalidTaskRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTaskRequestError";
  }
}

export interface TaskCreateRequest {
  title: string;
  responsibilityArea: ResponsibilityArea;
  description?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  energyRequired?: TaskEnergyLevel;
  priority?: TaskPriority;
  deepWork?: boolean;
}

export interface TaskUpdateRequest {
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

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidTaskRequestError("Request body must be an object.");
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throw new InvalidTaskRequestError("Request contains an unknown field.");
  }
}

function requiredTitle(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidTaskRequestError("Title is required.");
  }
  const title = value.trim();
  if (title.length > MAX_TASK_TITLE_LENGTH) {
    throw new InvalidTaskRequestError(
      `Title must be ${MAX_TASK_TITLE_LENGTH} characters or fewer.`,
    );
  }
  return title;
}

function optionalDescription(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new InvalidTaskRequestError("Description must be a string or null.");
  }
  const description = value.trim();
  if (!description) return null;
  if (description.length > MAX_TASK_DESCRIPTION_LENGTH) {
    throw new InvalidTaskRequestError(
      `Description must be ${MAX_TASK_DESCRIPTION_LENGTH} characters or fewer.`,
    );
  }
  return description;
}

function optionalDueAt(value: unknown): string | null {
  if (value === null) return null;
  const calendarMatch =
    typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})T/.exec(value) : null;
  const year = Number(calendarMatch?.[1]);
  const month = Number(calendarMatch?.[2]);
  const day = Number(calendarMatch?.[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  const validCalendarDate =
    calendarMatch !== null &&
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day;

  if (
    typeof value !== "string" ||
    !validCalendarDate ||
    !parseTimestampWithExplicitOffset(value)
  ) {
    throw new InvalidTaskRequestError(
      "Due date must be a valid timestamp with an explicit timezone offset.",
    );
  }
  return value;
}

function optionalEstimatedMinutes(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_TASK_ESTIMATED_MINUTES ||
    value > MAX_TASK_ESTIMATED_MINUTES
  ) {
    throw new InvalidTaskRequestError(
      `Estimated minutes must be a whole number from ${MIN_TASK_ESTIMATED_MINUTES} to ${MAX_TASK_ESTIMATED_MINUTES}.`,
    );
  }
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InvalidTaskRequestError(`${field} is invalid.`);
  }
  return value as T;
}

function optionalBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new InvalidTaskRequestError(`${field} must be a boolean.`);
  }
  return value;
}

export function parseTaskCreateRequest(value: unknown): TaskCreateRequest {
  const body = asObject(value);
  rejectUnknownFields(body, CREATE_FIELDS);

  const input: TaskCreateRequest = {
    title: requiredTitle(body.title),
    responsibilityArea: enumValue(
      body.responsibilityArea,
      RESPONSIBILITY_AREAS,
      "Responsibility area",
    ),
  };

  if (body.description !== undefined) input.description = optionalDescription(body.description);
  if (body.dueAt !== undefined) input.dueAt = optionalDueAt(body.dueAt);
  if (body.estimatedMinutes !== undefined) {
    input.estimatedMinutes = optionalEstimatedMinutes(body.estimatedMinutes);
  }
  if (body.energyRequired !== undefined) {
    input.energyRequired = enumValue(body.energyRequired, TASK_LEVELS, "Energy required");
  }
  if (body.priority !== undefined) {
    input.priority = enumValue(body.priority, TASK_LEVELS, "Priority");
  }
  if (body.deepWork !== undefined) {
    input.deepWork = optionalBoolean(body.deepWork, "Deep work");
  }

  return input;
}

export function parseTaskUpdateRequest(value: unknown): TaskUpdateRequest {
  const body = asObject(value);
  rejectUnknownFields(body, UPDATE_FIELDS);
  if (Object.keys(body).length === 0) {
    throw new InvalidTaskRequestError("At least one field is required.");
  }

  const input: TaskUpdateRequest = {};
  if (body.title !== undefined) input.title = requiredTitle(body.title);
  if (body.responsibilityArea !== undefined) {
    input.responsibilityArea = enumValue(
      body.responsibilityArea,
      RESPONSIBILITY_AREAS,
      "Responsibility area",
    );
  }
  if (body.description !== undefined) input.description = optionalDescription(body.description);
  if (body.status !== undefined) input.status = enumValue(body.status, TASK_STATUSES, "Status");
  if (body.dueAt !== undefined) input.dueAt = optionalDueAt(body.dueAt);
  if (body.estimatedMinutes !== undefined) {
    input.estimatedMinutes = optionalEstimatedMinutes(body.estimatedMinutes);
  }
  if (body.energyRequired !== undefined) {
    input.energyRequired = enumValue(body.energyRequired, TASK_LEVELS, "Energy required");
  }
  if (body.priority !== undefined) {
    input.priority = enumValue(body.priority, TASK_LEVELS, "Priority");
  }
  if (body.deepWork !== undefined) {
    input.deepWork = optionalBoolean(body.deepWork, "Deep work");
  }

  return input;
}
