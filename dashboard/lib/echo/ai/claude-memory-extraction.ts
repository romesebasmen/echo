import Anthropic from "@anthropic-ai/sdk";
import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from "./memory-extraction-prompt.ts";
import type {
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
} from "../types/index.ts";
import {
  MAX_MEMORY_DESCRIPTION_LENGTH,
  MAX_MEMORY_TITLE_LENGTH,
} from "../types/memory.ts";

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
export const MAX_MEMORY_OPERATIONS_PER_EXTRACTION = 10;
export { MAX_MEMORY_DESCRIPTION_LENGTH, MAX_MEMORY_TITLE_LENGTH };

export class InvalidMemoryExtractionResponseError extends Error {
  constructor(reason: string) {
    super(`Memory extraction response failed validation: ${reason}`);
    this.name = "InvalidMemoryExtractionResponseError";
  }
}

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
      maxItems: MAX_MEMORY_OPERATIONS_PER_EXTRACTION,
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "supersede"] },
          targetMemoryId: { type: ["string", "null"] },
          category: { type: "string", enum: MEMORY_CATEGORIES },
          title: {
            type: "string",
            minLength: 1,
            maxLength: MAX_MEMORY_TITLE_LENGTH,
          },
          description: {
            type: "string",
            minLength: 1,
            maxLength: MAX_MEMORY_DESCRIPTION_LENGTH,
          },
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidMemoryExtractionResponseError("response was not valid JSON");
  }

  return validateMemoryOperations(parsed, input.existingMemories);
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

const MEMORY_OPERATION_KEYS = [
  "action",
  "category",
  "confidence",
  "description",
  "importance",
  "targetMemoryId",
  "title",
];

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function parseMemoryOperation(
  value: unknown,
  existingMemoryIds: ReadonlySet<string>,
): MemoryOperation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidMemoryExtractionResponseError("operation must be an object");
  }
  const op = value as Record<string, unknown>;

  if (!hasExactKeys(op, MEMORY_OPERATION_KEYS)) {
    throw new InvalidMemoryExtractionResponseError(
      "operation fields did not match the contract",
    );
  }

  const hasValidAction =
    op.action === "create" || op.action === "update" || op.action === "supersede";
  const hasValidCategory =
    typeof op.category === "string" &&
    MEMORY_CATEGORIES.includes(op.category as MemoryCategory);
  const title = typeof op.title === "string" ? op.title.trim() : "";
  const description =
    typeof op.description === "string" ? op.description.trim() : "";
  const hasValidTitle =
    title.length > 0 && title.length <= MAX_MEMORY_TITLE_LENGTH;
  const hasValidDescription =
    description.length > 0 &&
    description.length <= MAX_MEMORY_DESCRIPTION_LENGTH;
  const hasValidImportance =
    typeof op.importance === "string" &&
    IMPORTANCE_LEVELS.includes(op.importance as MemoryImportance);
  const hasValidConfidence =
    typeof op.confidence === "string" &&
    CONFIDENCE_LEVELS.includes(op.confidence as MemoryConfidence);
  if (
    !hasValidAction ||
    !hasValidCategory ||
    !hasValidTitle ||
    !hasValidDescription ||
    !hasValidImportance ||
    !hasValidConfidence
  ) {
    throw new InvalidMemoryExtractionResponseError(
      "operation contained an invalid field value",
    );
  }

  if (op.action === "create" && op.targetMemoryId !== null) {
    throw new InvalidMemoryExtractionResponseError(
      "create operation must have a null targetMemoryId",
    );
  }

  if (
    op.action !== "create" &&
    (typeof op.targetMemoryId !== "string" ||
      !existingMemoryIds.has(op.targetMemoryId))
  ) {
    throw new InvalidMemoryExtractionResponseError(
      "update or supersede target was not an active supplied memory",
    );
  }

  return {
    action: op.action as MemoryOperationAction,
    targetMemoryId:
      op.action === "create" ? null : (op.targetMemoryId as string),
    category: op.category as MemoryCategory,
    title,
    description,
    importance: op.importance as MemoryImportance,
    confidence: op.confidence as MemoryConfidence,
  };
}

export function validateMemoryOperations(
  value: unknown,
  existingMemories: readonly ExistingMemoryContext[],
): MemoryOperation[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidMemoryExtractionResponseError("response must be an object");
  }

  const response = value as Record<string, unknown>;
  if (!hasExactKeys(response, ["operations"]) || !Array.isArray(response.operations)) {
    throw new InvalidMemoryExtractionResponseError(
      "response must contain only an operations array",
    );
  }
  if (response.operations.length > MAX_MEMORY_OPERATIONS_PER_EXTRACTION) {
    throw new InvalidMemoryExtractionResponseError("too many memory operations");
  }

  const existingMemoryIds = new Set(existingMemories.map((memory) => memory.id));
  const targetedMemoryIds = new Set<string>();
  return response.operations.map((operation) => {
    const parsed = parseMemoryOperation(operation, existingMemoryIds);
    if (parsed.targetMemoryId) {
      if (targetedMemoryIds.has(parsed.targetMemoryId)) {
        throw new InvalidMemoryExtractionResponseError(
          "an active memory was targeted more than once",
        );
      }
      targetedMemoryIds.add(parsed.targetMemoryId);
    }
    return parsed;
  });
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
