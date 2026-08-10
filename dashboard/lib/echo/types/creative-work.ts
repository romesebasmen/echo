import type { Platform } from "@/lib/echo/types/ui";

export type CreativeWorkOriginType =
  | "thought"
  | "conversation"
  | "memory"
  | "manual"
  | "daily_briefing";

export type CreativeWorkStatus =
  | "opportunity"
  | "ready"
  | "filming"
  | "editing"
  | "posted"
  | "abandoned";

export const MAX_CREATIVE_WORK_REFLECTION_LENGTH = 2_000;

// Shape of the AI-generated production package once a work reaches "ready".
// The generator that produces this isn't built yet — this type only
// describes what will eventually populate the `package` column.
export interface CreativeWorkPackage {
  title: string;
  hook: string;
  concept: string;
  beats: string[];
  caption: string;
  hashtags: string[];
  shotList: string[];
  editingNotes: string[];
  estimatedSeconds: number;
  whyItFits: string;
}

export interface CreativeWork {
  id: string;
  userId: string;
  originType: CreativeWorkOriginType;
  // Polymorphic reference (points into thoughts/messages/memories/
  // daily_briefings depending on originType) with no DB-level foreign key —
  // enforced in application code instead. Null only when originType is
  // "manual".
  originId: string | null;
  platform: Platform;
  status: CreativeWorkStatus;
  package: CreativeWorkPackage | null;
  reflection: string | null;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  postedAt: string | null;
}
