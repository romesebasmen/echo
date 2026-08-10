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
import {
  ThoughtInUseError,
  throwIfThoughtInUse,
} from "@/lib/echo/thoughts/persistence-error";
import { formatError } from "@/lib/echo/errors";

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
      .update({
        content: encodeThoughtContent(input.content, input),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", USER_ID)
      .select("*")
      .single();

    if (error) throw error;

    return Response.json({ thought: toThought(data) });
  } catch (error) {
    if (error instanceof InvalidThoughtRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("PATCH /api/thoughts/[id] failed:", error);
    return Response.json({ error: "Could not update thought." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("thoughts")
      .delete()
      .eq("id", id)
      .eq("user_id", USER_ID);

    if (error) {
      throwIfThoughtInUse(error);
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ThoughtInUseError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("DELETE /api/thoughts/[id] failed:", formatError(error));
    return Response.json({ error: "Could not delete thought." }, { status: 500 });
  }
}
