import type {
  EngagementSnapshot,
  EngagementState,
} from "../types/ui.ts";

export const NOT_CONNECTED_ENGAGEMENT_MESSAGE =
  "No social accounts connected. Echo will only show engagement and performance insights after they come from a verified source.";

export const SOCIAL_CONNECTIONS_UNAVAILABLE_MESSAGE =
  "Social connections aren’t available yet.";

export async function getEngagementState(): Promise<EngagementState> {
  return { status: "not-connected" };
}

export function getAvailableEngagementSnapshot(
  state: EngagementState,
): EngagementSnapshot | null {
  return state.status === "available" ? state.snapshot : null;
}
