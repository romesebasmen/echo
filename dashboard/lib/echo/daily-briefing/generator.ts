import { getRecentMessages } from "@/lib/echo/chat/conversation-store";
import { getRecentThoughts } from "@/lib/echo/thoughts/repository";
import { getCurrentFocus } from "@/lib/echo/daily-briefing/service";
import { getBestIdea } from "@/lib/echo/content-ideas/service";
import { generateBriefingContent } from "@/lib/echo/ai/claude-briefing";
import { getRelevantMemories } from "@/lib/echo/memories/retrieval";
import { formatError } from "@/lib/echo/errors";
import {
  getBriefingForDate,
  getMostRecentBriefing,
  saveBriefing,
  todayDateString,
} from "@/lib/echo/daily-briefing/repository";
import type { DailyBriefing } from "@/lib/echo/types";
import { runBriefingGenerationSingleFlight } from "@/lib/echo/daily-briefing/generation-single-flight";

const RECENT_MESSAGE_LIMIT = 20;
const RECENT_THOUGHT_LIMIT = 10;
const RELEVANT_MEMORY_LIMIT = 15;

async function buildAndSaveBriefing(briefingDate: string): Promise<DailyBriefing> {
  const [
    recentMessages,
    recentThoughts,
    currentFocus,
    bestIdea,
    previousBriefing,
    relevantMemories,
  ] = await Promise.all([
    getRecentMessages(RECENT_MESSAGE_LIMIT),
    getRecentThoughts(RECENT_THOUGHT_LIMIT),
    getCurrentFocus(),
    getBestIdea(),
    getMostRecentBriefing(),
    getRelevantMemories(RELEVANT_MEMORY_LIMIT).catch((error: unknown) => {
      console.error(
        "Fetching relevant memories for briefing failed, continuing without them:",
        formatError(error),
      );
      return [];
    }),
  ]);

  // "Since last briefing" only looks within the already-fetched recent
  // windows (last 20 messages / 10 thoughts) — if more than that arrived
  // between briefings, the count undercounts. Acceptable for a single-user
  // app at this volume; revisit with a dedicated count query if needed.
  const since = previousBriefing
    ? new Date(previousBriefing.createdAt).getTime()
    : 0;

  const thoughtCountSinceLastBriefing = recentThoughts.filter(
    (thought) => new Date(thought.createdAt).getTime() > since,
  ).length;
  const messageCountSinceLastBriefing = recentMessages.filter(
    (message) => new Date(message.createdAt).getTime() > since,
  ).length;

  const generated = await generateBriefingContent({
    recentThoughts: recentThoughts.map((thought) => ({
      content: thought.content,
      createdAt: thought.createdAt,
    })),
    recentMessages: recentMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    currentFocus,
    bestIdea: {
      title: bestIdea.title,
      concept: bestIdea.concept,
      platform: bestIdea.platform,
      hook: bestIdea.hook,
      whyItFits: bestIdea.whyItFits,
    },
    relevantMemories: relevantMemories.map((memory) => ({
      category: memory.category,
      title: memory.title,
      description: memory.description,
    })),
    thoughtCountSinceLastBriefing,
    messageCountSinceLastBriefing,
  });

  return saveBriefing({
    briefingDate,
    greeting: generated.greeting,
    whatChanged: generated.whatChanged,
    patternNoticed: generated.patternNoticed,
    bestRecommendation: generated.bestRecommendation,
    nextAction: generated.nextAction,
    bestIdeaId: bestIdea.id,
  });
}

export async function getTodaysBriefing(): Promise<DailyBriefing> {
  const briefingDate = todayDateString();
  const cached = await getBriefingForDate(briefingDate);
  if (cached) return cached;
  return runBriefingGenerationSingleFlight(briefingDate, () =>
    buildAndSaveBriefing(briefingDate),
  );
}

export async function regenerateTodaysBriefing(): Promise<DailyBriefing> {
  const briefingDate = todayDateString();
  return runBriefingGenerationSingleFlight(briefingDate, () =>
    buildAndSaveBriefing(briefingDate),
  );
}
