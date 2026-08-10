import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
  callAnthropicWithDiagnostics,
  MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH,
  summarizeAnthropicError,
  type AnthropicDiagnosticLogger,
  type SafeAnthropicErrorSummary,
} from "./anthropic-diagnostics.ts";
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
const MAX_OUTPUT_TOKENS = 2_048;

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

export {
  MAX_SAFE_ANTHROPIC_ERROR_MESSAGE_LENGTH,
  summarizeAnthropicError,
  type AnthropicDiagnosticLogger,
  type SafeAnthropicErrorSummary,
};

export async function callAnthropicDayPlanModelWithDiagnostics<T>(
  callModel: () => Promise<T>,
  logError: AnthropicDiagnosticLogger = (message) => {
    console.error(message);
  },
): Promise<T> {
  return callAnthropicWithDiagnostics("Day-plan", callModel, logError);
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
    ? { type: "string" as const, enum: [...taskIds] }
    : { type: "string" as const };

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
            format: jsonSchemaOutputFormat(
              buildDayPlanRegenerationOutputSchema(
                input.tasks.map((task) => task.id),
              ),
            ),
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
