import type { RadarItem } from "@/lib/echo/types";
import { radarItems } from "@/lib/echo/daily-briefing/radar.mock";
import { currentFocusReminder } from "@/lib/echo/daily-briefing/focus.mock";

export async function getRadarItems(): Promise<RadarItem[]> {
  return radarItems;
}

export async function getCurrentFocus(): Promise<string> {
  return currentFocusReminder;
}
