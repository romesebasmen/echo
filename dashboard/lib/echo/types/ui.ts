export type Platform = "YouTube" | "TikTok" | "Instagram";

export interface RadarItem {
  id: string;
  tag: string;
  headline: string;
  context: string;
  whyItMatters: string;
  contentAngle: string;
  source: string;
  freshness: string;
}

export interface MetricDelta {
  label: string;
  value: number;
}

export interface EngagementSnapshot {
  since: string;
  metrics: MetricDelta[];
  bestPost: string;
  bestPlatform: Platform;
  insight: string;
}

export interface VerifiedSocialSource {
  connectionId: string;
  platform: Platform;
  verificationStatus: "verified";
  verifiedAt: string;
}

export type EngagementState =
  | { status: "not-connected" }
  | {
      status: "available";
      source: VerifiedSocialSource;
      snapshot: EngagementSnapshot;
    }
  | {
      status: "temporarily-unavailable";
      source: VerifiedSocialSource;
      lastSuccessfulSyncAt: string | null;
    };

export type Effort = "Low" | "Medium" | "High";

export type Confidence = "Low" | "Medium" | "High";

export type EvidenceKind = "explicit" | "pattern" | "hypothesis";

export interface EvidenceItem {
  label: string;
  kind: EvidenceKind;
}

export interface IdeaOfTheDay {
  id: string;
  title: string;
  concept: string;
  platform: Platform;
  whyItFits: string;
  hook: string;
  effort: Effort;
  seriesPotential?: string;
  confidence: Confidence;
  evidenceBasis: EvidenceItem[];
}
