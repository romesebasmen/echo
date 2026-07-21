import type { Platform } from "@/lib/echo/types/ui";

export type ContentIdeaStatus = "suggested" | "in-progress" | "posted" | "dismissed";

export interface ContentIdea {
  id: string;
  userId: string;
  title: string;
  concept: string;
  platform: Platform;
  hook: string;
  status: ContentIdeaStatus;
  createdAt: string;
}
