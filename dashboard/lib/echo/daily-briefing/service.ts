import type { RadarItem } from "@/lib/echo/types";
import { editorialRadarItems } from "@/lib/echo/daily-briefing/editorial-radar";
import { editorialCurrentFocus } from "@/lib/echo/daily-briefing/editorial-focus";

export async function getRadarItems(): Promise<RadarItem[]> {
  return editorialRadarItems;
}

export async function getCurrentFocus(): Promise<string> {
  return editorialCurrentFocus;
}
