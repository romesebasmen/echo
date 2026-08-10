import { APIConnectionError, APIError } from "@anthropic-ai/sdk";

export const MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH = 240;
const ANTHROPIC_API_KEY_PATTERN = /sk-ant-[a-z0-9_-]+/gi;

export interface SafeAnthropicErrorSummary {
  sdkErrorName: string;
  status: number | null;
  type: string | null;
  requestId: string | null;
  safeMessage: string;
}

export type AnthropicDiagnosticLogger = (message: string) => void;

function redactAndTruncateConnectionMessage(message: string): string {
  const redacted = message
    .replace(ANTHROPIC_API_KEY_PATTERN, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = redacted || "Anthropic connection failed.";

  if (fallback.length <= MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH) {
    return fallback;
  }

  return `${fallback.slice(0, MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH - 1)}…`;
}

export function summarizeAnthropicError(error: unknown): SafeAnthropicErrorSummary {
  if (error instanceof APIConnectionError) {
    return {
      sdkErrorName: error.constructor.name,
      status: null,
      type: "connection_error",
      requestId: null,
      safeMessage: redactAndTruncateConnectionMessage(error.message),
    };
  }

  if (error instanceof APIError) {
    const status = error.status ?? null;
    const type = error.type ?? null;
    return {
      sdkErrorName: error.constructor.name,
      status,
      type,
      requestId: error.requestID ?? null,
      safeMessage: type
        ? `Anthropic API request failed (${type}).`
        : status
          ? `Anthropic API request failed with HTTP ${status}.`
          : "Anthropic API request failed.",
    };
  }

  return {
    sdkErrorName: error instanceof Error ? error.constructor.name : "UnknownError",
    status: null,
    type: null,
    requestId: null,
    safeMessage: "Anthropic SDK request failed.",
  };
}

export async function callAnthropicWithDiagnostics<T>(
  operation: string,
  callModel: () => Promise<T>,
  logError: AnthropicDiagnosticLogger = (message) => {
    console.error(message);
  },
): Promise<T> {
  try {
    return await callModel();
  } catch (error) {
    const summary = summarizeAnthropicError(error);
    logError(`${operation} Anthropic request failed: ${JSON.stringify(summary)}`);
    throw error;
  }
}
