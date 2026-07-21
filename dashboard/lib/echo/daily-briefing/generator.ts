import { getRecentMessages } from "@/lib/echo/chat/conversation-store";
import { getRecentThoughts } from "@/lib/echo/thoughts/repository";
import { getCurrentFocus } from "@/lib/echo/daily-briefing/service";
import { getBestIdea } from "@/lib/echo/content-ideas/service";
import { generateBriefingContent } from "@/lib/echo/ai/claude-briefing";
import {
  getBriefingForDate,
  getMostRecentBriefing,
  saveBriefing,
  todayDateString,
} from "@/lib/echo/daily-briefing/repository";
import type { DailyBriefing } from "@/lib/echo/types";

const RECENT_MESSAGE_LIMIT = 20;
const RECENT_THOUGHT_LIMIT = 10;

async function buildAndSaveBriefing(): Promise<DailyBriefing> {
  const [recentMessages, recentThoughts, currentFocus, bestIdea, previousBriefing] =
    await Promise.all([
      getRecentMessages(RECENT_MESSAGE_LIMIT),
      getRecentThoughts(RECENT_THOUGHT_LIMIT),
      getCurrentFocus(),
      getBestIdea(),
      getMostRecentBriefing(),
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
    thoughtCountSinceLastBriefing,
    messageCountSinceLastBriefing,
  });

  return saveBriefing({
    briefingDate: todayDateString(),
    greeting: generated.greeting,
    whatChanged: generated.whatChanged,
    patternNoticed: generated.patternNoticed,
    bestRecommendation: generated.bestRecommendation,
    nextAction: generated.nextAction,
    bestIdeaId: bestIdea.id,
  });
}

export async function getTodaysBriefing(): Promise<DailyBriefing> {
  const cached = await getBriefingForDate(todayDateString());
  if (cached) return cached;
  return buildAndSaveBriefing();
}

export async function regenerateTodaysBriefing(): Promise<DailyBriefing> {
  return buildAndSaveBriefing();
}
