import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import type { BriefingPatternKind, DailyBriefing } from "@/lib/echo/types";
import { getBriefingDate } from "@/lib/echo/daily-briefing/date";

const USER_ID = "sebastian";

export class MissingBriefingsTableError extends Error {
  constructor() {
    super(
      "The daily_briefings table does not exist yet. See the setup SQL to create it.",
    );
    this.name = "MissingBriefingsTableError";
  }
}

interface BriefingRow {
  id: string;
  user_id: string;
  briefing_date: string;
  greeting: string;
  what_changed: string;
  pattern_noticed: string;
  pattern_kind: string;
  best_recommendation: string;
  next_action: string;
  best_idea_id: string | null;
  created_at: string;
}

interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

function isMissingTableError(error: PostgrestErrorLike): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    Boolean(error.message?.includes("Could not find the table"))
  );
}

function toBriefing(row: BriefingRow): DailyBriefing {
  const kind: BriefingPatternKind =
    row.pattern_kind === "pattern" ? "pattern" : "hypothesis";

  return {
    id: row.id,
    userId: row.user_id,
    briefingDate: row.briefing_date,
    greeting: row.greeting,
    whatChanged: row.what_changed,
    patternNoticed: { text: row.pattern_noticed, kind },
    bestRecommendation: row.best_recommendation,
    nextAction: row.next_action,
    bestIdeaId: row.best_idea_id,
    createdAt: row.created_at,
  };
}

export function todayDateString(now = new Date()): string {
  return getBriefingDate(now);
}

export async function getBriefingForDate(
  date: string,
): Promise<DailyBriefing | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("daily_briefings")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("briefing_date", date)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) throw new MissingBriefingsTableError();
    throw error;
  }

  return data ? toBriefing(data as BriefingRow) : null;
}

export async function getMostRecentBriefing(): Promise<DailyBriefing | null> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("daily_briefings")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) throw new MissingBriefingsTableError();
    throw error;
  }

  return data ? toBriefing(data as BriefingRow) : null;
}

export interface SaveBriefingInput {
  briefingDate: string;
  greeting: string;
  whatChanged: string;
  patternNoticed: { text: string; kind: BriefingPatternKind };
  bestRecommendation: string;
  nextAction: string;
  bestIdeaId: string | null;
}

export async function saveBriefing(
  input: SaveBriefingInput,
): Promise<DailyBriefing> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("daily_briefings")
    .upsert(
      {
        user_id: USER_ID,
        briefing_date: input.briefingDate,
        greeting: input.greeting,
        what_changed: input.whatChanged,
        pattern_noticed: input.patternNoticed.text,
        pattern_kind: input.patternNoticed.kind,
        best_recommendation: input.bestRecommendation,
        next_action: input.nextAction,
        best_idea_id: input.bestIdeaId,
      },
      { onConflict: "user_id,briefing_date" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) throw new MissingBriefingsTableError();
    throw error;
  }

  return toBriefing(data as BriefingRow);
}
