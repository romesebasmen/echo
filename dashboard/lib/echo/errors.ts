// Raw Error objects serialize to "{}" in Next's structured dev/prod logs
// (message/stack aren't own enumerable properties) — always format through
// this before logging, or failures become silently unreadable.
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
