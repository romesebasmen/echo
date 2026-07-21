import type { Memory } from "@/lib/echo/types";
import { creatorProfile } from "@/lib/echo/profile";

export const memories: Memory[] = [
  {
    id: "memory-1",
    userId: creatorProfile.id,
    category: "pattern",
    content:
      "Reaction-driven videos about everyday complaints consistently outperform scripted bits.",
    importance: "high",
    source: "Engagement tracker",
    createdAt: "2026-07-15T09:00:00.000Z",
  },
  {
    id: "memory-2",
    userId: creatorProfile.id,
    category: "preference",
    content: "Prefers low-production, single-take ideas over anything that needs a script.",
    importance: "medium",
    source: "Thought Inbox",
    createdAt: "2026-07-12T14:30:00.000Z",
  },
  {
    id: "memory-3",
    userId: creatorProfile.id,
    category: "goal",
    content: "Wants to keep \"Things That Should Be Illegal\" as a recurring series.",
    importance: "high",
    source: "Chat with Echo",
    createdAt: "2026-07-10T18:00:00.000Z",
  },
];
