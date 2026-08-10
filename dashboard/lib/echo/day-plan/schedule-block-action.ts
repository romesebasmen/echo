export type ScheduleTaskBlockAction = "completed" | "skipped";

export class InvalidScheduleBlockActionRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScheduleBlockActionRequestError";
  }
}

export function parseScheduleBlockId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new InvalidScheduleBlockActionRequestError(
      "Schedule block ID must be a valid UUID.",
    );
  }
  return value;
}

export function parseScheduleBlockActionRequest(
  value: unknown,
): { status: ScheduleTaskBlockAction } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidScheduleBlockActionRequestError("Request body must be an object.");
  }

  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !("status" in body)) {
    throw new InvalidScheduleBlockActionRequestError(
      "Request must contain only status.",
    );
  }
  if (body.status !== "completed" && body.status !== "skipped") {
    throw new InvalidScheduleBlockActionRequestError(
      "status must be completed or skipped.",
    );
  }

  return { status: body.status };
}
