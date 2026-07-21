import type { EngagementSnapshot, RadarItem } from "@/lib/echo/types";
import { engagementSnapshot } from "@/lib/echo/daily-briefing/engagement.mock";
import { radarItems } from "@/lib/echo/daily-briefing/radar.mock";
import { currentFocusReminder } from "@/lib/echo/daily-briefing/focus.mock";

export async function getEngagementSnapshot(): Promise<EngagementSnapshot> {
  return engagementSnapshot;
}

export async function getRadarItems(): Promise<RadarItem[]> {
  return radarItems;
}

export async function getCurrentFocus(): Promise<string> {
  return currentFocusReminder;
}
