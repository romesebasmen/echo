// "pattern" = inferred from at least two separate pieces of stored evidence;
// "hypothesis" = a single-signal or weaker read. Neither is a fact Sebastián
// stated directly — see docs/echo-constitution.md Rule 9 (evidence vs.
// inference).
export type BriefingPatternKind = "pattern" | "hypothesis";

export interface BriefingPattern {
  text: string;
  kind: BriefingPatternKind;
}

export interface DailyBriefing {
  id: string;
  userId: string;
  briefingDate: string;
  greeting: string;
  whatChanged: string;
  patternNoticed: BriefingPattern;
  bestRecommendation: string;
  nextAction: string;
  bestIdeaId: string | null;
  createdAt: string;
}
