import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import {
  decodeThoughtContent,
  encodeThoughtContent,
} from "@/lib/echo/thoughts/content-encoding";
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

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("thoughts")
      .select("*")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ thoughts: (data ?? []).map(toThought) });
  } catch (error) {
    console.error("GET /api/thoughts failed:", error);
    return Response.json({ error: "Could not load thoughts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return Response.json({ error: "Content is required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("thoughts")
      .insert({
        user_id: USER_ID,
        content: encodeThoughtContent(content, {
          context: typeof body.context === "string" ? body.context : undefined,
          possibleFormat:
            typeof body.possibleFormat === "string" ? body.possibleFormat : undefined,
        }),
      })
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({ thought: toThought(data) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/thoughts failed:", error);
    return Response.json({ error: "Could not save thought." }, { status: 500 });
  }
}
