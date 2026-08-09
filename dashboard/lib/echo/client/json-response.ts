export interface JsonResponseOptions<T> {
  fallbackMessage: string;
  isSuccessBody: (body: unknown) => body is T;
  createError?: (message: string, status: number) => Error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasResponseField<Key extends string>(
  body: unknown,
  key: Key,
): body is Record<Key, unknown> {
  return isRecord(body) && Object.prototype.hasOwnProperty.call(body, key);
}

function serverErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || typeof body.error !== "string") return null;
  const message = body.error.trim();
  return message.length > 0 ? message : null;
}

export async function parseJsonResponse<T>(
  response: Response,
  options: JsonResponseOptions<T>,
): Promise<T> {
  const makeError = options.createError ?? ((message: string) => new Error(message));
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw makeError(options.fallbackMessage, response.status);
  }

  const responseError = serverErrorMessage(body);
  if (!response.ok || responseError || !options.isSuccessBody(body)) {
    throw makeError(responseError ?? options.fallbackMessage, response.status);
  }

  return body;
}
