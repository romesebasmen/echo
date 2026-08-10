import Anthropic from "@anthropic-ai/sdk";
import { TIKTOK_PACKAGE_SYSTEM_PROMPT } from "./tiktok-package-prompt.ts";
import type { CreativeWorkPackage } from "../types/index.ts";

// SERVER-ONLY. Import this only from Route Handlers (app/api/**/route.ts).
// ANTHROPIC_API_KEY is read here and must never reach the browser bundle.
//
// Deliberately no retry loop here (unlike claude-memory-extraction.ts) — a
// generation call has a real cost and the caller (the generate route) is
// responsible for deciding whether to try again, not this module.

export class InvalidGeneratedPackageError extends Error {
  constructor(reason: string) {
    super(`Generated TikTok package failed validation: ${reason}`);
    this.name = "InvalidGeneratedPackageError";
  }
}

export interface TikTokPackageGenerationInput {
  thought: {
    content: string;
    context?: string;
    possibleFormat?: string;
  };
  relevantMemories: { category: string; title: string; description: string }[];
  creatorName: string;
  recurringSeries?: string;
}

let cachedClient: Anthropic | null = null;

export const TIKTOK_PACKAGE_MODEL = "claude-opus-4-8";
export const TIKTOK_PACKAGE_MAX_RETRIES = 0;
export const TIKTOK_PACKAGE_LIMITS = {
  title: 120,
  hook: 300,
  concept: 1_000,
  beats: 8,
  caption: 2_200,
  hashtags: 12,
  shotList: 12,
  editingNotes: 12,
  listItem: 300,
  hashtag: 100,
  estimatedSeconds: 600,
  whyItFits: 500,
} as const;

export function createAnthropicTikTokPackageClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: TIKTOK_PACKAGE_MAX_RETRIES });
}

function getClient(): Anthropic {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable.");
  }

  cachedClient = createAnthropicTikTokPackageClient(apiKey);
  return cachedClient;
}

const TIKTOK_PACKAGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.title },
    hook: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.hook },
    concept: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.concept },
    beats: {
      type: "array",
      minItems: 1,
      maxItems: TIKTOK_PACKAGE_LIMITS.beats,
      items: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.listItem },
    },
    caption: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.caption },
    hashtags: {
      type: "array",
      minItems: 1,
      maxItems: TIKTOK_PACKAGE_LIMITS.hashtags,
      items: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.hashtag },
    },
    shotList: {
      type: "array",
      minItems: 1,
      maxItems: TIKTOK_PACKAGE_LIMITS.shotList,
      items: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.listItem },
    },
    editingNotes: {
      type: "array",
      minItems: 1,
      maxItems: TIKTOK_PACKAGE_LIMITS.editingNotes,
      items: { type: "string", minLength: 1, maxLength: TIKTOK_PACKAGE_LIMITS.listItem },
    },
    estimatedSeconds: {
      type: "integer",
      minimum: 1,
      maximum: TIKTOK_PACKAGE_LIMITS.estimatedSeconds,
    },
    whyItFits: {
      type: "string",
      minLength: 1,
      maxLength: TIKTOK_PACKAGE_LIMITS.whyItFits,
    },
  },
  required: [
    "title",
    "hook",
    "concept",
    "beats",
    "caption",
    "hashtags",
    "shotList",
    "editingNotes",
    "estimatedSeconds",
    "whyItFits",
  ],
  additionalProperties: false,
} as const;

// Runtime validation, not just a TypeScript cast — the project's existing
// convention for validating AI output (see isValidOperation in
// claude-memory-extraction.ts, and the manual required-field checks in
// claude-briefing.ts) is a hand-written type guard rather than a schema
// library, so this follows the same pattern rather than introducing one.
const CREATIVE_WORK_PACKAGE_FIELDS = [
  "title",
  "hook",
  "concept",
  "beats",
  "caption",
  "hashtags",
  "shotList",
  "editingNotes",
  "estimatedSeconds",
  "whyItFits",
] as const;

function boundedString(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function boundedStringArray(
  value: unknown,
  maximumItems: number,
  maximumItemLength: number,
): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumItems) {
    return null;
  }
  const normalized = value.map((item) => boundedString(item, maximumItemLength));
  return normalized.every((item): item is string => item !== null) ? normalized : null;
}

export function parseCreativeWorkPackage(value: unknown): CreativeWorkPackage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidGeneratedPackageError("response did not contain an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).length !== CREATIVE_WORK_PACKAGE_FIELDS.length ||
    CREATIVE_WORK_PACKAGE_FIELDS.some((field) => !(field in candidate))
  ) {
    throw new InvalidGeneratedPackageError("response fields did not match the package contract");
  }

  const title = boundedString(candidate.title, TIKTOK_PACKAGE_LIMITS.title);
  const hook = boundedString(candidate.hook, TIKTOK_PACKAGE_LIMITS.hook);
  const concept = boundedString(candidate.concept, TIKTOK_PACKAGE_LIMITS.concept);
  const beats = boundedStringArray(
    candidate.beats,
    TIKTOK_PACKAGE_LIMITS.beats,
    TIKTOK_PACKAGE_LIMITS.listItem,
  );
  const caption = boundedString(candidate.caption, TIKTOK_PACKAGE_LIMITS.caption);
  const hashtags = boundedStringArray(
    candidate.hashtags,
    TIKTOK_PACKAGE_LIMITS.hashtags,
    TIKTOK_PACKAGE_LIMITS.hashtag,
  );
  const shotList = boundedStringArray(
    candidate.shotList,
    TIKTOK_PACKAGE_LIMITS.shotList,
    TIKTOK_PACKAGE_LIMITS.listItem,
  );
  const editingNotes = boundedStringArray(
    candidate.editingNotes,
    TIKTOK_PACKAGE_LIMITS.editingNotes,
    TIKTOK_PACKAGE_LIMITS.listItem,
  );
  const whyItFits = boundedString(candidate.whyItFits, TIKTOK_PACKAGE_LIMITS.whyItFits);
  if (
    !title ||
    !hook ||
    !concept ||
    !beats ||
    !caption ||
    !hashtags ||
    !shotList ||
    !editingNotes ||
    !Number.isInteger(candidate.estimatedSeconds) ||
    (candidate.estimatedSeconds as number) < 1 ||
    (candidate.estimatedSeconds as number) > TIKTOK_PACKAGE_LIMITS.estimatedSeconds ||
    !whyItFits
  ) {
    throw new InvalidGeneratedPackageError("response values did not match the package contract");
  }

  return {
    title,
    hook,
    concept,
    beats,
    caption,
    hashtags,
    shotList,
    editingNotes,
    estimatedSeconds: candidate.estimatedSeconds as number,
    whyItFits,
  };
}

export function isValidCreativeWorkPackage(value: unknown): value is CreativeWorkPackage {
  try {
    parseCreativeWorkPackage(value);
    return true;
  } catch {
    return false;
  }
}

// Rough chars-per-token heuristic for English text — not a real tokenizer.
// Getting an exact per-section token count would require a separate call to
// Anthropic's count_tokens endpoint (a different endpoint from
// messages.create, and typically free, but still a network call this
// module doesn't otherwise make) — logging character counts locally instead
// keeps prompt-size visibility at zero additional cost and zero additional
// Anthropic calls.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface PromptSections {
  creatorContext: string;
  memoriesBlock: string;
  thoughtBlock: string;
}

function buildPromptSections(input: TikTokPackageGenerationInput): PromptSections {
  const memoriesBlock = input.relevantMemories.length
    ? input.relevantMemories
        .map((memory) => `- [${memory.category}] ${memory.title}: ${memory.description}`)
        .join("\n")
    : "(no stored memories yet)";

  const contextLines = [
    input.thought.context ? `Context: ${input.thought.context}` : null,
    input.thought.possibleFormat ? `Possible format: ${input.thought.possibleFormat}` : null,
  ].filter((line): line is string => Boolean(line));

  const creatorContext = `Creator: ${input.creatorName}${
    input.recurringSeries ? ` — recurring series: "${input.recurringSeries}"` : ""
  }`;

  const thoughtBlock = `${input.thought.content}${
    contextLines.length ? "\n" + contextLines.join("\n") : ""
  }`;

  return { creatorContext, memoriesBlock, thoughtBlock };
}

function buildUserPrompt(
  input: TikTokPackageGenerationInput,
  sections: PromptSections,
): string {
  return `${sections.creatorContext}

The thought to turn into a TikTok package:
${sections.thoughtBlock}

What Echo remembers about ${input.creatorName} (use only if genuinely relevant — don't force a reference just because it's available):
${sections.memoriesBlock}

Generate the complete production package now.`;
}

function logPromptSizeBreakdown(
  input: TikTokPackageGenerationInput,
  sections: PromptSections,
): void {
  const memoryCount = input.relevantMemories.length;
  const parts = [
    `system: ${TIKTOK_PACKAGE_SYSTEM_PROMPT.length} chars (~${estimateTokens(TIKTOK_PACKAGE_SYSTEM_PROMPT)} tok est.)`,
    `creator context: ${sections.creatorContext.length} chars (~${estimateTokens(sections.creatorContext)} tok est.)`,
    `memories: ${sections.memoriesBlock.length} chars (~${estimateTokens(sections.memoriesBlock)} tok est., ${memoryCount} memor${memoryCount === 1 ? "y" : "ies"})`,
    `thought: ${sections.thoughtBlock.length} chars (~${estimateTokens(sections.thoughtBlock)} tok est.)`,
  ];
  console.log(`TikTok package generation prompt size — ${parts.join(" | ")}`);
}

export async function generateTikTokPackage(
  input: TikTokPackageGenerationInput,
): Promise<CreativeWorkPackage> {
  const client = getClient();

  const sections = buildPromptSections(input);
  logPromptSizeBreakdown(input, sections);

  const response = await client.messages.create({
    model: TIKTOK_PACKAGE_MODEL,
    max_tokens: 1536,
    system: TIKTOK_PACKAGE_SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: TIKTOK_PACKAGE_JSON_SCHEMA },
    },
    messages: [{ role: "user", content: buildUserPrompt(input, sections) }],
  });

  console.log(
    `TikTok package generation token usage — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`,
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new InvalidGeneratedPackageError("response contained no text content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new InvalidGeneratedPackageError("response was not valid JSON");
  }

  return parseCreativeWorkPackage(parsed);
}
