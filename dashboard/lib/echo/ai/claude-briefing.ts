import Anthropic from "@anthropic-ai/sdk";
import { BRIEFING_SYSTEM_PROMPT } from "@/lib/echo/ai/briefing-system-prompt";
import type { BriefingPatternKind } from "@/lib/echo/types";

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

const BRIEFING_JSON_SCHEMA = {
  type: "object",
  properties: {
    greeting: { type: "string" },
    whatChanged: { type: "string" },
    patternNoticed: {
      type: "object",
      properties: {
        text: { type: "string" },
        kind: { type: "string", enum: ["pattern", "hypothesis"] },
      },
      required: ["text", "kind"],
      additionalProperties: false,
    },
    bestRecommendation: { type: "string" },
    nextAction: { type: "string" },
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

export async function generateBriefingContent(
  input: BriefingGenerationInput,
): Promise<GeneratedBriefingContent> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: BRIEFING_SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: BRIEFING_JSON_SCHEMA },
    },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Briefing response contained no text content.");
  }

  const parsed = JSON.parse(textBlock.text) as Partial<GeneratedBriefingContent>;

  if (
    !parsed.greeting ||
    !parsed.whatChanged ||
    !parsed.patternNoticed?.text ||
    !parsed.patternNoticed?.kind ||
    !parsed.bestRecommendation ||
    !parsed.nextAction
  ) {
    throw new Error("Briefing response was missing required fields.");
  }

  return parsed as GeneratedBriefingContent;
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
