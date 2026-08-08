import Anthropic, { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import {
  buildDayPlanRegenerationUserPrompt,
  DAY_PLAN_REGENERATION_SYSTEM_PROMPT,
} from "./day-plan-regeneration-prompt.ts";
import {
  DayPlanRecommendationProviderUnavailableError,
  InvalidDayPlanRecommendationProviderOutputError,
  type DayPlanRecommendationProvider,
} from "../day-plan/regeneration-service.ts";
import {
  InvalidDayPlanRegenerationProposalError,
  MAX_REGENERATION_EXPLANATION_LENGTH,
  validateDayPlanRegenerationProposal,
} from "../day-plan/regeneration-proposal.ts";
import {
  TASK_RECOMMENDATION_DISPOSITIONS,
  type DayPlanRecommendationInput,
} from "../types/day-plan-regeneration.ts";

// SERVER-ONLY. Import this only from Route Handlers or other server modules.
// The client and API key are created lazily; importing this module performs no
// network request and does not read ANTHROPIC_API_KEY.

export const DAY_PLAN_REGENERATION_MODEL = "claude-opus-4-8";
export const DAY_PLAN_REGENERATION_MAX_RETRIES = 0;
export const MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH = 240;
const MAX_OUTPUT_TOKENS = 2_048;
const ANTHROPIC_API_KEY_PATTERN = /sk-ant-[a-z0-9_-]+/gi;

interface ClaudeResponseBlock {
  type: string;
  text?: string;
}

export interface ClaudeDayPlanRecommendationResponse {
  content: readonly ClaudeResponseBlock[];
}

export type ClaudeDayPlanMessageCaller = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<ClaudeDayPlanRecommendationResponse>;

export interface SafeAnthropicErrorSummary {
  sdkErrorName: string;
  status: number | null;
  type: string | null;
  requestId: string | null;
  safeMessage: string;
}

export type AnthropicErrorSummaryLogger = (
  summary: SafeAnthropicErrorSummary,
) => void;

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
      // Do not use APIError.message here: the SDK may build it from the
      // response body. Status and type are enough to diagnose safely.
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
    // Unknown errors are deliberately not echoed because their messages may
    // contain arbitrary request context.
    safeMessage: "Anthropic SDK request failed.",
  };
}

export async function callAnthropicDayPlanModelWithDiagnostics<T>(
  callModel: () => Promise<T>,
  logError: AnthropicErrorSummaryLogger = (summary) => {
    console.error("Day-plan Anthropic request failed:", summary);
  },
): Promise<T> {
  try {
    return await callModel();
  } catch (error) {
    logError(summarizeAnthropicError(error));
    throw error;
  }
}

let cachedClient: Anthropic | null = null;

export function createAnthropicDayPlanClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    maxRetries: DAY_PLAN_REGENERATION_MAX_RETRIES,
  });
}

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = createAnthropicDayPlanClient(apiKey);
  return cachedClient;
}

export function buildDayPlanRegenerationOutputSchema(taskIds: readonly string[]) {
  const taskIdSchema = taskIds.length > 0
    ? { type: "string", enum: [...taskIds] }
    : { type: "string" };

  return {
    type: "object",
    properties: {
      explanation: {
        type: "string",
        minLength: 1,
        maxLength: MAX_REGENERATION_EXPLANATION_LENGTH,
      },
      recommendations: {
        type: "array",
        minItems: taskIds.length,
        maxItems: taskIds.length,
        items: {
          type: "object",
          properties: {
            taskId: taskIdSchema,
            disposition: {
              type: "string",
              enum: [...TASK_RECOMMENDATION_DISPOSITIONS],
            },
          },
          required: ["taskId", "disposition"],
          additionalProperties: false,
        },
      },
    },
    required: ["explanation", "recommendations"],
    additionalProperties: false,
  } as const;
}

function invalidOutput(reason: string): InvalidDayPlanRecommendationProviderOutputError {
  return new InvalidDayPlanRecommendationProviderOutputError(
    new InvalidDayPlanRegenerationProposalError(reason),
  );
}

export function createClaudeDayPlanRecommendationProvider(
  callModel: ClaudeDayPlanMessageCaller,
): DayPlanRecommendationProvider {
  return {
    async recommend(input: DayPlanRecommendationInput) {
      let response: ClaudeDayPlanRecommendationResponse;
      try {
        response = await callModel({
          model: DAY_PLAN_REGENERATION_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: DAY_PLAN_REGENERATION_SYSTEM_PROMPT,
          output_config: {
            format: {
              type: "json_schema",
              schema: buildDayPlanRegenerationOutputSchema(
                input.tasks.map((task) => task.id),
              ),
            },
          },
          messages: [
            { role: "user", content: buildDayPlanRegenerationUserPrompt(input) },
          ],
        });
      } catch (error) {
        throw new DayPlanRecommendationProviderUnavailableError(error);
      }

      const textBlock = response.content.find(
        (block) => block.type === "text" && typeof block.text === "string",
      );
      if (!textBlock?.text) {
        throw invalidOutput("response contained no text content");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw invalidOutput("response was not valid JSON");
      }

      try {
        return validateDayPlanRegenerationProposal(parsed, {
          openTaskIds: input.tasks.map((task) => task.id),
          commitmentIds: input.commitments.map((commitment) => commitment.id),
        });
      } catch (error) {
        if (error instanceof InvalidDayPlanRegenerationProposalError) {
          throw new InvalidDayPlanRecommendationProviderOutputError(error);
        }
        throw error;
      }
    },
  };
}

export const claudeDayPlanRecommendationProvider =
  createClaudeDayPlanRecommendationProvider(async (params) => {
    const client = getClient();
    return callAnthropicDayPlanModelWithDiagnostics(() =>
      client.messages.create(params),
    );
  });
