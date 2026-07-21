import type { EngagementSnapshot } from "@/lib/echo/types";

export const engagementSnapshot: EngagementSnapshot = {
  since: "your last visit, 2 days ago",
  metrics: [
    { label: "Followers", value: 142 },
    { label: "Views", value: 18400 },
    { label: "Likes", value: 2310 },
    { label: "Comments", value: 96 },
    { label: "Shares", value: 54 },
  ],
  bestPost: "\"I tried to cancel a subscription and it took 40 minutes\" (TikTok)",
  bestPlatform: "TikTok",
  insight:
    "Your last three best-performing posts all opened with a complaint. Reactions to everyday friction are outperforming scripted bits right now.",
};
