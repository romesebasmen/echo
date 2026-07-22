import Anthropic from "@anthropic-ai/sdk";
import { MEMORY_EXTRACTION_SYSTEM_PROMPT } from "@/lib/echo/ai/memory-extraction-prompt";
import { formatError } from "@/lib/echo/errors";
import type {
  MemoryCategory,
  MemoryConfidence,
  MemoryImportance,
} from "@/lib/echo/types";

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

const MAX_ATTEMPTS = 2;

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

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = new Anthropic({ apiKey });
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

// Wrapped with one retry: a single transient failure (a flaky response, a
// JSON parse hiccup) should not mean a durable preference silently never
// gets captured. See docs/echo-constitution.md — reliability of capture
// matters here, not just correctness of the extraction logic.
export async function extractMemoryOperations(
  input: MemoryExtractionInput,
): Promise<MemoryOperation[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await attemptExtraction(input);
    } catch (error) {
      lastError = error;
      console.error(`Memory extraction attempt ${attempt} failed:`, formatError(error));
    }
  }

  throw lastError;
}

async function attemptExtraction(
  input: MemoryExtractionInput,
): Promise<MemoryOperation[]> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: MEMORY_EXTRACTION_SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: MEMORY_EXTRACTION_SCHEMA },
    },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Memory extraction response contained no text content.");
  }

  const parsed = JSON.parse(textBlock.text) as { operations?: unknown };
  if (!Array.isArray(parsed.operations)) {
    throw new Error("Memory extraction response was missing an operations array.");
  }

  return parsed.operations.filter(isValidOperation);
}

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
