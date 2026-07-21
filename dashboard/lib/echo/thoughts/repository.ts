import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import { decodeThoughtContent } from "@/lib/echo/thoughts/content-encoding";
import type { Thought } from "@/lib/echo/types";

const USER_ID = "sebastian";

interface ThoughtRow {
  id: string;
  user_id: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function toThought(row: ThoughtRow): Thought {
  const decoded = decodeThoughtContent(row.content);
  return {
    id: row.id,
    userId: row.user_id,
    content: decoded.content,
    context: decoded.context,
    possibleFormat: decoded.possibleFormat,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRecentThoughts(limit: number): Promise<Thought[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("thoughts")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map(toThought);
}
