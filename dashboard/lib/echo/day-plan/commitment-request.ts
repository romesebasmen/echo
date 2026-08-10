import {
  RESPONSIBILITY_AREAS,
  type ResponsibilityArea,
} from "../types/responsibility-area.ts";
import {
  parseTimestampWithExplicitOffset,
  toUserDateString,
} from "../timezone.ts";

export const MAX_COMMITMENT_TITLE_LENGTH = 200;

export class InvalidCommitmentRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommitmentRequestError";
  }
}

export interface CommitmentCreateRequest {
  title: string;
  startTime: string;
  endTime: string;
  responsibilityArea: ResponsibilityArea | null;
}

export function parseCommitmentId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new InvalidCommitmentRequestError(
      "Commitment ID must be a valid UUID.",
    );
  }
  return value;
}

export function parseCommitmentCreateRequest(
  value: unknown,
  planDate: string,
): CommitmentCreateRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidCommitmentRequestError("Request body must be an object.");
  }

  const body = value as Record<string, unknown>;
  const allowedFields = new Set([
    "title",
    "startTime",
    "endTime",
    "responsibilityArea",
  ]);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw new InvalidCommitmentRequestError(
      "Request contains an unknown field.",
    );
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    throw new InvalidCommitmentRequestError("Title is required.");
  }
  const title = body.title.trim();
  if (title.length > MAX_COMMITMENT_TITLE_LENGTH) {
    throw new InvalidCommitmentRequestError(
      `Title must be ${MAX_COMMITMENT_TITLE_LENGTH} characters or fewer.`,
    );
  }

  if (typeof body.startTime !== "string" || typeof body.endTime !== "string") {
    throw new InvalidCommitmentRequestError(
      "startTime and endTime must be timestamps.",
    );
  }
  const startTime = parseTimestampWithExplicitOffset(body.startTime);
  const endTime = parseTimestampWithExplicitOffset(body.endTime);
  if (!startTime || !endTime) {
    throw new InvalidCommitmentRequestError(
      "Commitment times must be valid timestamps with an explicit timezone offset.",
    );
  }
  if (startTime.getTime() >= endTime.getTime()) {
    throw new InvalidCommitmentRequestError(
      "Commitment startTime must be earlier than endTime.",
    );
  }
  if (
    toUserDateString(startTime) !== planDate ||
    toUserDateString(endTime) !== planDate
  ) {
    throw new InvalidCommitmentRequestError(
      "Commitment times must fall within today's Chicago calendar date.",
    );
  }

  let responsibilityArea: ResponsibilityArea | null = null;
  if (body.responsibilityArea !== undefined && body.responsibilityArea !== null) {
    if (
      typeof body.responsibilityArea !== "string" ||
      !RESPONSIBILITY_AREAS.includes(
        body.responsibilityArea as ResponsibilityArea,
      )
    ) {
      throw new InvalidCommitmentRequestError(
        "Responsibility area is invalid.",
      );
    }
    responsibilityArea = body.responsibilityArea as ResponsibilityArea;
  }

  return {
    title,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    responsibilityArea,
  };
}
