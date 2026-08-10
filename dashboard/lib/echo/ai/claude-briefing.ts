import Anthropic from "@anthropic-ai/sdk";
import { callAnthropicWithDiagnostics } from "./anthropic-diagnostics.ts";
import { BRIEFING_SYSTEM_PROMPT } from "./briefing-system-prompt.ts";
import type { BriefingPatternKind } from "../types/index.ts";

// SERVER-ONLY. Import this only from Route Handlers (app/api/**/route.ts).
// ANTHROPIC_API_KEY is read here and must never reach the browser bundle.

export interface BriefingGenerationInput {
  recentThoughts: { content: string; createdAt: string }[];
  recentMessages: { role: "user" | "echo"; content: string }[];
  currentFocus: string;
  bestIdea: {
    title: string;
    concept: string;
    platform: string;
    hook: string;
    whyItFits: string;
  };
  relevantMemories: { category: string; title: string; description: string }[];
  thoughtCountSinceLastBriefing: number;
  messageCountSinceLastBriefing: number;
}

export interface GeneratedBriefingContent {
  greeting: string;
  whatChanged: string;
  patternNoticed: { text: string; kind: BriefingPatternKind };
  bestRecommendation: string;
  nextAction: string;
}

export class InvalidGeneratedBriefingError extends Error {
  constructor(reason: string) {
    super(`Generated briefing failed validation: ${reason}`);
    this.name = "InvalidGeneratedBriefingError";
  }
}

export class BriefingProviderUnavailableError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("The Echo briefing provider is unavailable.");
    this.name = "BriefingProviderUnavailableError";
    this.cause = cause;
  }
}

let cachedClient: Anthropic | null = null;

export const BRIEFING_MODEL = "claude-opus-4-8";
export const BRIEFING_MAX_RETRIES = 0;
export const BRIEFING_CONTENT_LIMITS = {
  greeting: 200,
  whatChanged: 1_000,
  patternText: 1_000,
  bestRecommendation: 1_000,
  nextAction: 500,
} as const;

export function createAnthropicBriefingClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: BRIEFING_MAX_RETRIES });
}

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = createAnthropicBriefingClient(apiKey);
  return cachedClient;
}

const BRIEFING_JSON_SCHEMA = {
  type: "object",
  properties: {
    greeting: {
      type: "string",
      minLength: 1,
      maxLength: BRIEFING_CONTENT_LIMITS.greeting,
    },
    whatChanged: {
      type: "string",
      minLength: 1,
      maxLength: BRIEFING_CONTENT_LIMITS.whatChanged,
    },
    patternNoticed: {
      type: "object",
      properties: {
        text: {
          type: "string",
          minLength: 1,
          maxLength: BRIEFING_CONTENT_LIMITS.patternText,
        },
        kind: { type: "string", enum: ["pattern", "hypothesis"] },
      },
      required: ["text", "kind"],
      additionalProperties: false,
    },
    bestRecommendation: {
      type: "string",
      minLength: 1,
      maxLength: BRIEFING_CONTENT_LIMITS.bestRecommendation,
    },
    nextAction: {
      type: "string",
      minLength: 1,
      maxLength: BRIEFING_CONTENT_LIMITS.nextAction,
    },
  },
  required: [
    "greeting",
    "whatChanged",
    "patternNoticed",
    "bestRecommendation",
    "nextAction",
  ],
  additionalProperties: false,
} as const;

const BRIEFING_FIELDS = [
  "greeting",
  "whatChanged",
  "patternNoticed",
  "bestRecommendation",
  "nextAction",
] as const;

function boundedBriefingText(
  value: unknown,
  maximumLength: number,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidGeneratedBriefingError(`${field} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new InvalidGeneratedBriefingError(`${field} exceeded its length limit`);
  }
  return normalized;
}

export function parseGeneratedBriefingContent(value: unknown): GeneratedBriefingContent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGeneratedBriefingError("response did not contain an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== BRIEFING_FIELDS.length ||
    BRIEFING_FIELDS.some((field) => !(field in candidate))
  ) {
    throw new InvalidGeneratedBriefingError("response fields did not match the contract");
  }
  if (
    typeof candidate.patternNoticed !== "object" ||
    candidate.patternNoticed === null ||
    Array.isArray(candidate.patternNoticed)
  ) {
    throw new InvalidGeneratedBriefingError("patternNoticed did not contain an object");
  }
  const pattern = candidate.patternNoticed as Record<string, unknown>;
  if (
    Object.keys(pattern).length !== 2 ||
    !("text" in pattern) ||
    !("kind" in pattern) ||
    (pattern.kind !== "pattern" && pattern.kind !== "hypothesis")
  ) {
    throw new InvalidGeneratedBriefingError("patternNoticed did not match the contract");
  }

  return {
    greeting: boundedBriefingText(
      candidate.greeting,
      BRIEFING_CONTENT_LIMITS.greeting,
      "greeting",
    ),
    whatChanged: boundedBriefingText(
      candidate.whatChanged,
      BRIEFING_CONTENT_LIMITS.whatChanged,
      "whatChanged",
    ),
    patternNoticed: {
      text: boundedBriefingText(
        pattern.text,
        BRIEFING_CONTENT_LIMITS.patternText,
        "patternNoticed.text",
      ),
      kind: pattern.kind,
    },
    bestRecommendation: boundedBriefingText(
      candidate.bestRecommendation,
      BRIEFING_CONTENT_LIMITS.bestRecommendation,
      "bestRecommendation",
    ),
    nextAction: boundedBriefingText(
      candidate.nextAction,
      BRIEFING_CONTENT_LIMITS.nextAction,
      "nextAction",
    ),
  };
}

export async function generateBriefingContent(
  input: BriefingGenerationInput,
): Promise<GeneratedBriefingContent> {
  let response;
  try {
    const client = getClient();
    response = await callAnthropicWithDiagnostics("Briefing", () =>
      client.messages.create({
        model: BRIEFING_MODEL,
        max_tokens: 1024,
        system: BRIEFING_SYSTEM_PROMPT,
        output_config: {
          format: { type: "json_schema", schema: BRIEFING_JSON_SCHEMA },
        },
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      }),
    );
  } catch (error) {
    throw new BriefingProviderUnavailableError(error);
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new InvalidGeneratedBriefingError("response contained no text content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidGeneratedBriefingError("response was not valid JSON");
  }
  return parseGeneratedBriefingContent(parsed);
}

function buildUserPrompt(input: BriefingGenerationInput): string {
  const thoughtsBlock = input.recentThoughts.length
    ? input.recentThoughts
        .map((thought) => `- (${thought.createdAt}) ${thought.content}`)
        .join("\n")
    : "(no thoughts recorded)";

  const messagesBlock = input.recentMessages.length
    ? input.recentMessages
        .map(
          (message) =>
            `${message.role === "echo" ? "Echo" : "Sebastián"}: ${message.content}`,
        )
        .join("\n")
    : "(no chat history)";

  const memoriesBlock = input.relevantMemories.length
    ? input.relevantMemories
        .map((memory) => `- [${memory.category}] ${memory.title}: ${memory.description}`)
        .join("\n")
    : "(no stored memories yet)";

  return `Here is Sebastián's current stored context. Use only this — do not invent anything beyond it.

Activity since the last briefing:
- ${input.thoughtCountSinceLastBriefing} new thought(s)
- ${input.messageCountSinceLastBriefing} new chat message(s)

What Echo remembers about Sebastián long-term (use only if relevant — don't force it in):
${memoriesBlock}

Recent thoughts (most recent first, up to 10):
${thoughtsBlock}

Recent conversation (up to 20 messages, chronological):
${messagesBlock}

Current focus reminder:
${input.currentFocus}

Today's best content idea (already decided — do not replace it):
- Title: ${input.bestIdea.title}
- Concept: ${input.bestIdea.concept}
- Platform: ${input.bestIdea.platform}
- Hook: ${input.bestIdea.hook}
- Why it fits: ${input.bestIdea.whyItFits}

Write the briefing now.`;
}
