export const MAX_THOUGHT_CONTENT_LENGTH = 8_000;
export const MAX_THOUGHT_CONTEXT_LENGTH = 1_000;
export const MAX_THOUGHT_FORMAT_LENGTH = 200;

export class InvalidThoughtRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidThoughtRequestError";
  }
}

export interface ThoughtWriteInput {
  content: string;
  context?: string;
  possibleFormat?: string;
}

function optionalTrimmedString(
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new InvalidThoughtRequestError(`${field} must be a string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > maximumLength) {
    throw new InvalidThoughtRequestError(
      `${field} must be ${maximumLength} characters or fewer.`,
    );
  }
  return trimmed;
}

export function parseThoughtWriteRequest(value: unknown): ThoughtWriteInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidThoughtRequestError("Request body must be an object.");
  }

  const body = value as Record<string, unknown>;
  const allowedFields = new Set(["content", "context", "possibleFormat"]);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw new InvalidThoughtRequestError("Request contains an unknown field.");
  }

  if (typeof body.content !== "string" || !body.content.trim()) {
    throw new InvalidThoughtRequestError("Content is required.");
  }
  const content = body.content.trim();
  if (content.length > MAX_THOUGHT_CONTENT_LENGTH) {
    throw new InvalidThoughtRequestError(
      `Content must be ${MAX_THOUGHT_CONTENT_LENGTH} characters or fewer.`,
    );
  }

  const context = optionalTrimmedString(
    body.context,
    "Context",
    MAX_THOUGHT_CONTEXT_LENGTH,
  );
  const possibleFormat = optionalTrimmedString(
    body.possibleFormat,
    "Possible format",
    MAX_THOUGHT_FORMAT_LENGTH,
  );

  return {
    content,
    ...(context ? { context } : {}),
    ...(possibleFormat ? { possibleFormat } : {}),
  };
}
