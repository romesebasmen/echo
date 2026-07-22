import { after } from "next/server";
import { getSupabaseServerClient } from "@/lib/echo/supabase/server-client";
import { getMockEchoReply } from "@/lib/echo/chat/mock-responder";
import { getClaudeReply } from "@/lib/echo/ai/claude-responder";
import {
  fromRole,
  getOrCreateConversationId,
  getRecentMessages,
  toMessage,
} from "@/lib/echo/chat/conversation-store";
import { getRelevantMemories } from "@/lib/echo/memories/retrieval";
import { extractAndApplyMemories } from "@/lib/echo/memories/extraction-service";
import { formatError } from "@/lib/echo/errors";
import type { Memory } from "@/lib/echo/types";

const RECENT_HISTORY_LIMIT = 20;
const RELEVANT_MEMORY_LIMIT = 20;

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const conversationId = await getOrCreateConversationId();

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return Response.json({
      conversationId,
      messages: (data ?? []).map(toMessage),
    });
  } catch (error) {
    console.error("GET /api/chat failed:", formatError(error));
    return Response.json({ error: "Could not load conversation." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return Response.json({ error: "Message content is required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const conversationId = await getOrCreateConversationId();

    // Recent history is fetched before inserting the new user message, so
    // it doesn't need to be de-duplicated against `content` below.
    const recentHistory = await getRecentMessages(RECENT_HISTORY_LIMIT);

    let relevantMemories: Memory[];
    try {
      relevantMemories = await getRelevantMemories(RELEVANT_MEMORY_LIMIT);
    } catch (memoryError) {
      console.error(
        "Fetching relevant memories failed, continuing without them:",
        formatError(memoryError),
      );
      relevantMemories = [];
    }

    const { data: userRow, error: userError } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: fromRole("user"), content })
      .select("*")
      .single();

    if (userError) throw userError;

    let replyText: string;
    try {
      replyText = await getClaudeReply(recentHistory, content, relevantMemories);
    } catch (aiError) {
      console.error(
        "Claude API call failed, falling back to mock responder:",
        formatError(aiError),
      );
      replyText = getMockEchoReply(content);
    }

    const { data: echoRow, error: echoError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: fromRole("echo"),
        content: replyText,
      })
      .select("*")
      .single();

    if (echoError) throw echoError;

    const { error: touchError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (touchError) throw touchError;

    // Memory extraction runs after the response is sent — its failure must
    // never affect the chat reply the user already received.
    after(async () => {
      try {
        const appliedCount = await extractAndApplyMemories({
          userMessage: content,
          echoReply: replyText,
          sourceMessageId: userRow.id as string,
          sourceType: "chat",
        });
        if (appliedCount > 0) {
          console.log(`Memory extraction applied ${appliedCount} operation(s).`);
        }
      } catch (extractionError) {
        console.error("Memory extraction failed:", formatError(extractionError));
      }
    });

    return Response.json(
      { userMessage: toMessage(userRow), echoMessage: toMessage(echoRow) },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/chat failed:", formatError(error));
    return Response.json({ error: "Could not send message." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = getSupabaseServerClient();
    const conversationId = await getOrCreateConversationId();

    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/chat failed:", formatError(error));
    return Response.json({ error: "Could not clear conversation." }, { status: 500 });
  }
}
