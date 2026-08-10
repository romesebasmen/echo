import {
  MAX_MEMORY_DESCRIPTION_LENGTH,
  MAX_MEMORY_TITLE_LENGTH,
  type MemoryCategory,
  type MemoryConfidence,
  type MemoryImportance,
  type MemoryStatus,
} from "../types/memory.ts";

const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "identity",
  "preference",
  "goal",
  "project",
  "relationship",
  "routine",
  "creator-style",
  "constraint",
  "other",
];
const MEMORY_LEVELS: readonly (MemoryImportance | MemoryConfidence)[] = [
  "low",
  "medium",
  "high",
];
const MEMORY_STATUSES: readonly MemoryStatus[] = ["active", "superseded", "archived"];
const MEMORY_UPDATE_FIELDS = new Set([
  "title",
  "description",
  "category",
  "importance",
  "confidence",
  "status",
]);

export class InvalidMemoryRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMemoryRequestError";
  }
}

export interface MemoryUpdateRequest {
  title?: string;
  description?: string;
  category?: MemoryCategory;
  importance?: MemoryImportance;
  confidence?: MemoryConfidence;
  status?: MemoryStatus;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new InvalidMemoryRequestError(`${field} is invalid.`);
  }
  return value as T;
}

function boundedText(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidMemoryRequestError(`${field} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new InvalidMemoryRequestError(
      `${field} must be ${maximumLength} characters or fewer.`,
    );
  }
  return normalized;
}

export function parseMemoryUpdateRequest(value: unknown): MemoryUpdateRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidMemoryRequestError("Request body must be an object.");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((field) => !MEMORY_UPDATE_FIELDS.has(field))) {
    throw new InvalidMemoryRequestError("Request contains an unknown field.");
  }
  if (Object.keys(body).length === 0) {
    throw new InvalidMemoryRequestError("At least one field is required.");
  }

  const input: MemoryUpdateRequest = {};
  if (body.title !== undefined) {
    input.title = boundedText(body.title, "Title", MAX_MEMORY_TITLE_LENGTH);
  }
  if (body.description !== undefined) {
    input.description = boundedText(
      body.description,
      "Description",
      MAX_MEMORY_DESCRIPTION_LENGTH,
    );
  }
  if (body.category !== undefined) {
    input.category = enumValue(body.category, MEMORY_CATEGORIES, "Category");
  }
  if (body.importance !== undefined) {
    input.importance = enumValue(body.importance, MEMORY_LEVELS, "Importance");
  }
  if (body.confidence !== undefined) {
    input.confidence = enumValue(body.confidence, MEMORY_LEVELS, "Confidence");
  }
  if (body.status !== undefined) {
    input.status = enumValue(body.status, MEMORY_STATUSES, "Status");
  }
  return input;
}
