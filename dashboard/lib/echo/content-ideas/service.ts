import type { IdeaOfTheDay } from "@/lib/echo/types";
import { editorialIdeaOfTheDay } from "@/lib/echo/content-ideas/editorial";

export async function getBestIdea(): Promise<IdeaOfTheDay> {
  return editorialIdeaOfTheDay;
}
