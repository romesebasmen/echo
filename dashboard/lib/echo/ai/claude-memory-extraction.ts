import Anthropic from "@anthropic-ai/sdk";
import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from "./memory-extraction-prompt.ts";
import type {
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
} from "../types/index.ts";

// SERVER-ONLY. Import this only from Route Handlers / server-only modules.
// ANTHROPIC_API_KEY is read here and must never reach the browser bundle.

const MEMORY_CATEGORIES: MemoryCategory[] = [
  "identity",
  "preference",
  "goal",
  "project",
  "relationship",
  "routine",
  "creator-style",
  "constraint",
  "other",
];

const IMPORTANCE_LEVELS: MemoryImportance[] = ["low", "medium", "high"];
const CONFIDENCE_LEVELS: MemoryConfidence[] = ["low", "medium", "high"];

export const MEMORY_EXTRACTION_MODEL = "claude-opus-4-8";
export const MEMORY_EXTRACTION_MAX_RETRIES = 0;

export interface ExistingMemoryContext {
  id: string;
  category: MemoryCategory;
  title: string;
  description: string;
}

export interface MemoryExtractionInput {
  userMessage: string;
  echoReply: string;
  existingMemories: ExistingMemoryContext[];
}

export type MemoryOperationAction = "create" | "update" | "supersede";

export interface MemoryOperation {
  action: MemoryOperationAction;
  targetMemoryId: string | null;
  category: MemoryCategory;
  title: string;
  description: string;
  importance: MemoryImportance;
  confidence: MemoryConfidence;
}

let cachedClient: Anthropic | null = null;

export function createAnthropicMemoryExtractionClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: MEMORY_EXTRACTION_MAX_RETRIES });
}

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = createAnthropicMemoryExtractionClient(apiKey);
  return cachedClient;
}

const MEMORY_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    operations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "supersede"] },
          targetMemoryId: { type: ["string", "null"] },
          category: { type: "string", enum: MEMORY_CATEGORIES },
          title: { type: "string" },
          description: { type: "string" },
          importance: { type: "string", enum: IMPORTANCE_LEVELS },
          confidence: { type: "string", enum: CONFIDENCE_LEVELS },
        },
        required: [
          "action",
          "targetMemoryId",
          "category",
          "title",
          "description",
          "importance",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["operations"],
  additionalProperties: false,
} as const;

// Memory extraction is best-effort background enrichment. One user chat
// exchange produces at most one provider request; failures are surfaced to
// the caller and never retried implicitly.
interface MemoryExtractionResponse {
  content: readonly { type: string; text?: string }[];
}

export type MemoryExtractionMessageCaller = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<MemoryExtractionResponse>;

async function attemptExtraction(
  input: MemoryExtractionInput,
  callModel: MemoryExtractionMessageCaller,
): Promise<MemoryOperation[]> {
  const response = await callModel({
    model: MEMORY_EXTRACTION_MODEL,
    max_tokens: 1024,
    system: MEMORY_EXTRACTION_SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: MEMORY_EXTRACTION_SCHEMA },
    },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  const textBlock = response.content.find(
    (block) => block.type === "text" && typeof block.text === "string",
  );
  if (!textBlock?.text) {
    throw new Error("Memory extraction response contained no text content.");
  }

  const parsed = JSON.parse(textBlock.text) as { operations?: unknown };
  if (!Array.isArray(parsed.operations)) {
    throw new Error("Memory extraction response was missing an operations array.");
  }

  return parsed.operations.filter(isValidOperation);
}

export function createMemoryOperationsExtractor(
  callModel: MemoryExtractionMessageCaller,
) {
  return (input: MemoryExtractionInput): Promise<MemoryOperation[]> =>
    attemptExtraction(input, callModel);
}

export const extractMemoryOperations = createMemoryOperationsExtractor(
  async (params) => {
    const client = getClient();
    return client.messages.create(params);
  },
);

function isValidOperation(value: unknown): value is MemoryOperation {
  if (typeof value !== "object" || value === null) return false;
  const op = value as Record<string, unknown>;

  const hasValidAction =
    op.action === "create" || op.action === "update" || op.action === "supersede";
  const hasValidCategory =
    typeof op.category === "string" &&
    MEMORY_CATEGORIES.includes(op.category as MemoryCategory);
  const hasValidTitle = typeof op.title === "string" && op.title.trim().length > 0;
  const hasValidDescription =
    typeof op.description === "string" && op.description.trim().length > 0;
  const hasValidImportance =
    typeof op.importance === "string" &&
    IMPORTANCE_LEVELS.includes(op.importance as MemoryImportance);
  const hasValidConfidence =
    typeof op.confidence === "string" &&
    CONFIDENCE_LEVELS.includes(op.confidence as MemoryConfidence);
  const hasValidTarget = op.targetMemoryId === null || typeof op.targetMemoryId === "string";
  const targetPresentWhenRequired =
    op.action === "create" || (typeof op.targetMemoryId === "string" && op.targetMemoryId.length > 0);

  return (
    hasValidAction &&
    hasValidCategory &&
    hasValidTitle &&
    hasValidDescription &&
    hasValidImportance &&
    hasValidConfidence &&
    hasValidTarget &&
    targetPresentWhenRequired
  );
}

function buildUserPrompt(input: MemoryExtractionInput): string {
  const existingBlock = input.existingMemories.length
    ? input.existingMemories
        .map(
          (memory) =>
            `- id: ${memory.id} [${memory.category}] "${memory.title}" — ${memory.description}`,
        )
        .join("\n")
    : "(no existing memories yet)";

  return `Sebastián's current active memories:
${existingBlock}

The exchange to consider:
Sebastián: ${input.userMessage}
Echo: ${input.echoReply}

Decide what, if anything, should be created, updated, or superseded.`;
}
