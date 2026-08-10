import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import {
  decodeThoughtContent,
  encodeThoughtContent,
} from "@/lib/echo/thoughts/content-encoding";
import type { Thought } from "@/lib/echo/types";
import {
  InvalidThoughtRequestError,
  parseThoughtWriteRequest,
} from "@/lib/echo/thoughts/request";

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const input = parseThoughtWriteRequest(body);

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("thoughts")
      .insert({
        user_id: USER_ID,
        content: encodeThoughtContent(input.content, input),
      })
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({ thought: toThought(data) }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidThoughtRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/thoughts failed:", error);
    return Response.json({ error: "Could not save thought." }, { status: 500 });
  }
}
