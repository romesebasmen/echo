import {
  MAX_CREATIVE_WORK_REFLECTION_LENGTH,
  type CreativeWorkStatus,
} from "../types/creative-work.ts";

const CREATIVE_WORK_STATUSES: readonly CreativeWorkStatus[] = [
  "opportunity",
  "ready",
  "filming",
  "editing",
  "posted",
  "abandoned",
];

export class InvalidCreativeWorkRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCreativeWorkRequestError";
  }
}

export interface CreativeWorkCreateRequest {
  thoughtId: string;
}

export interface CreativeWorkUpdateRequest {
  status?: CreativeWorkStatus;
  reflection?: string;
}

export interface CreativeWorkGenerationRequest {
  force: boolean;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidCreativeWorkRequestError("Request body must be an object.");
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(body: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(body).some((field) => !allowed.has(field))) {
    throw new InvalidCreativeWorkRequestError("Request contains an unknown field.");
  }
}

export function parseCreativeWorkCreateRequest(value: unknown): CreativeWorkCreateRequest {
  const body = asObject(value);
  rejectUnknownFields(body, new Set(["thoughtId"]));
  if (typeof body.thoughtId !== "string" || !body.thoughtId.trim()) {
    throw new InvalidCreativeWorkRequestError("thoughtId is required.");
  }
  return { thoughtId: body.thoughtId.trim() };
}

export function parseCreativeWorkUpdateRequest(value: unknown): CreativeWorkUpdateRequest {
  const body = asObject(value);
  rejectUnknownFields(body, new Set(["status", "reflection"]));
  if (Object.keys(body).length === 0) {
    throw new InvalidCreativeWorkRequestError("At least one field is required.");
  }

  const input: CreativeWorkUpdateRequest = {};
  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !CREATIVE_WORK_STATUSES.includes(body.status as CreativeWorkStatus)
    ) {
      throw new InvalidCreativeWorkRequestError("Status is invalid.");
    }
    input.status = body.status as CreativeWorkStatus;
  }
  if (body.reflection !== undefined) {
    if (typeof body.reflection !== "string" || !body.reflection.trim()) {
      throw new InvalidCreativeWorkRequestError("Reflection must be a non-empty string.");
    }
    const reflection = body.reflection.trim();
    if (reflection.length > MAX_CREATIVE_WORK_REFLECTION_LENGTH) {
      throw new InvalidCreativeWorkRequestError(
        `Reflection must be ${MAX_CREATIVE_WORK_REFLECTION_LENGTH} characters or fewer.`,
      );
    }
    input.reflection = reflection;
  }
  return input;
}

export function parseCreativeWorkGenerationRequest(
  value: unknown,
): CreativeWorkGenerationRequest {
  const body = asObject(value);
  rejectUnknownFields(body, new Set(["force"]));
  if (body.force !== undefined && typeof body.force !== "boolean") {
    throw new InvalidCreativeWorkRequestError("force must be a boolean.");
  }
  return { force: body.force ?? false };
}
