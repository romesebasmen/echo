import type { ContentIdea, IdeaOfTheDay } from "@/lib/echo/types";
import { contentIdeas, ideaOfTheDay } from "@/lib/echo/content-ideas/mock";

export async function getBestIdea(): Promise<IdeaOfTheDay> {
  return ideaOfTheDay;
}

export async function getContentIdeas(): Promise<ContentIdea[]> {
  return contentIdeas;
}
